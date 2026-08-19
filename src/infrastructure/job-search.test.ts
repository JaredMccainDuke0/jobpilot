import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./secrets", () => ({ getSecret: vi.fn(async () => "test-key") }));
// URL verification resolves the host before fetching; keep it hermetic by returning a public IP.
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));
import { buildJobFingerprint, searchJobs } from "./job-search";

const env = { ...process.env };
afterEach(() => { vi.restoreAllMocks(); process.env = { ...env }; });
const validJob = { title: "通信算法工程师", company: "测试科技有限公司", city: "深圳", education: "本科", graduationYear: null, workMode: "现场", industry: "通信", description: "负责无线通信算法研发、系统验证以及工程实现工作。", applicationEmail: "jobs@official.test", applicationUrl: "https://official.test/careers/123", sourceName: "测试科技招聘", sourceUrl: "https://official.test/careers/123" };
function responseFor(jobs: unknown[], citations: string[]) { return new Response(JSON.stringify({ output: [{ type: "web_search_call", status: "completed" }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(jobs), annotations: citations.map((url) => ({ url })) }] }] }), { status: 200 }); }
// Fresh Response per call so the fan-out (multiple web_search queries) can each read a body.
function mockFetch(jobs: unknown[], citations: string[]) { return vi.spyOn(globalThis, "fetch").mockImplementation(async () => responseFor(jobs, citations)); }
function configure() {
  process.env.JOBPILOT_MODEL_BASE_URL = "https://model.test/v1";
  process.env.JOBPILOT_MODEL_NAME = "gpt-5.6-sol";
  delete process.env.JOBPILOT_VERIFY_URLS;
  delete process.env.JOBPILOT_VERIFY_SOURCES;
}

describe("Responses web search job adapter", () => {
  it("returns up to ten cited jobs and stops after a full general search", async () => {
    configure();
    const jobs = Array.from({ length: 12 }, (_, index) => ({ ...validJob, title: `通信算法工程师 ${index}`, sourceUrl: `https://official.test/careers/${index}`, applicationUrl: `https://official.test/careers/${index}` }));
    const fetchMock = mockFetch(jobs, jobs.map((job) => job.sourceUrl));
    const result = await searchJobs({ text: "通信和 AI", city: "深圳", candidate: { skills: ["Python"] }, excludeUrls: ["https://seen.test/job"] });
    expect(result.mode).toBe("live"); expect(result.jobs).toHaveLength(10);
    expect(fetchMock.mock.calls.length).toBe(1);
    for (const call of fetchMock.mock.calls) {
      const request = JSON.parse(String(call[1]?.body));
      expect(request.tools).toEqual([{ type: "web_search" }]);
      expect(request.input).toContain("https://seen.test/job");
      expect(request.input).toContain("aiming for at least 5 and returning up to 10");
    }
  });

  it("runs focused follow-up searches only when the general result is insufficient", async () => {
    configure();
    const batches = [
      Array.from({ length: 2 }, (_, index) => ({ ...validJob, title: `主搜索岗位 ${index}`, applicationEmail: `main-${index}@official.test`, sourceUrl: `https://official.test/main/${index}`, applicationUrl: `https://official.test/main/${index}` })),
      Array.from({ length: 2 }, (_, index) => ({ ...validJob, title: `补充岗位 ${index}`, applicationEmail: `follow-${index}@official.test`, sourceUrl: `https://official.test/follow/${index}`, applicationUrl: `https://official.test/follow/${index}` })),
      [{ ...validJob, title: "最后一个岗位", applicationEmail: "last@official.test", sourceUrl: "https://official.test/last", applicationUrl: "https://official.test/last" }],
    ];
    let call = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const jobs = batches[Math.min(call, batches.length - 1)];
      call += 1;
      return responseFor(jobs, jobs.map((job) => job.sourceUrl));
    });

    const result = await searchJobs({ text: "通信和 AI", city: "深圳", candidate: { skills: ["Python"] } });

    expect(result.jobs).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not include resume contact details in the model prompt", async () => {
    configure();
    const fetchMock = mockFetch([validJob], [validJob.sourceUrl]);

    await searchJobs({
      text: "请联系 Private Person 或 private@example.test，电话 13800138000",
      city: "深圳",
      candidate: {
        name: "Private Person",
        email: "private@example.test",
        phone: "13800138000",
        school: "Private University",
        summary: "Private Person 的联系方式是 private@example.test，电话 13800138000",
        skills: ["Python"],
      },
    });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.input).not.toContain("Private Person");
    expect(request.input).not.toContain("private@example.test");
    expect(request.input).not.toContain("13800138000");
    expect(request.input).not.toContain("Private University");
  });

  it("rejects uncited, wrong-city, example and previously shown results", async () => {
    configure();
    const wrongCity = { ...validJob, city: "广州", sourceUrl: "https://official.test/guangzhou", applicationUrl: "https://official.test/guangzhou" };
    const example = { ...validJob, sourceUrl: "https://example.com/job", applicationUrl: "https://example.com/job" };
    mockFetch([validJob, wrongCity, example], [validJob.sourceUrl, wrongCity.sourceUrl, example.sourceUrl]);
    const result = await searchJobs({ text: "通信", city: "深圳", candidate: {}, excludeUrls: [validJob.sourceUrl] });
    expect(result.jobs).toEqual([]); expect(result.warning).toContain("未用虚拟职位补足");
  });

  it("returns no fallback jobs when web search is not executed", async () => {
    configure();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "[]", annotations: [] }] }] }), { status: 200 }));
    const result = await searchJobs({ text: "通信", city: "深圳", candidate: {} });
    expect(result.jobs).toEqual([]); expect(result.mode).toBe("unavailable"); expect(result.warning).toBe("模型没有执行联网搜索");
  });

  it("retries a transient model connection failure before returning results", async () => {
    configure();
    const jobs = Array.from({ length: 5 }, (_, index) => ({
      ...validJob,
      title: `重试恢复岗位 ${index}`,
      sourceUrl: `https://official.test/retry/${index}`,
      applicationUrl: `https://official.test/retry/${index}`,
    }));
    let calls = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return responseFor(jobs, jobs.map((job) => job.sourceUrl));
    });

    const result = await searchJobs({ text: "通信和 AI", city: "深圳", candidate: { skills: ["Python"] } });

    expect(result.mode).toBe("live");
    expect(result.jobs).toHaveLength(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts a job when the citation is a sibling page on the same official host", async () => {
    configure();
    const job = { ...validJob, city: "深圳", company: "Acme 智能", applicationEmail: "hr@acme.cn", sourceName: "Acme 招聘", sourceUrl: "https://careers.acme.cn/jobs/ai-42", applicationUrl: "https://careers.acme.cn/jobs/ai-42" };
    // Model cited the careers landing page, not the exact posting URL — same host, different path.
    mockFetch([job], ["https://careers.acme.cn/all-openings"]);
    const result = await searchJobs({ text: "大模型", city: "深圳", candidate: { skills: ["机器学习"] } });
    expect(result.mode).toBe("live");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].applicationEmail).toBe("hr@acme.cn");
  });

  it("excludes a previously shown job by fingerprint even when the source URL changes", async () => {
    configure();
    mockFetch([validJob], [validJob.sourceUrl]);

    const result = await searchJobs({
      text: "通信",
      city: "深圳",
      candidate: {},
      excludeFingerprints: [buildJobFingerprint(validJob)],
    });

    expect(result.jobs).toEqual([]);
  });

  it("normalizes administrative city suffixes (深圳市 satisfies 深圳)", async () => {
    configure();
    const job = { ...validJob, city: "深圳市", sourceUrl: "https://official.test/careers/9", applicationUrl: "https://official.test/careers/9" };
    mockFetch([job], [job.sourceUrl]);
    const result = await searchJobs({ text: "通信", city: "深圳", candidate: {} });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].city).toBe("深圳市");
  });

  it("keeps multiple distinct vacancies published on one official page", async () => {
    configure();
    const a = { ...validJob, title: "AI 算法工程师", applicationEmail: "hr@official.test", sourceUrl: "https://official.test/careers/list", applicationUrl: "https://official.test/careers/list" };
    const b = { ...a, title: "NLP 工程师" };
    // Same page returned twice (a duplicated) plus a sibling role — stable dedupe keeps two.
    mockFetch([a, b, a], [a.sourceUrl]);
    const result = await searchJobs({ text: "大模型 NLP", city: "深圳", candidate: { skills: ["Python"] } });
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.map((job) => job.title).sort()).toEqual(["AI 算法工程师", "NLP 工程师"]);
  });

  it("accepts jobs cited only via web_search_call.action when message annotations are empty", async () => {
    configure();
    // OpenAI Responses shape: message annotations come back empty; the browsed URLs live on
    // web_search_call.action (open_page.url + site: operators). This is the zero-results regression.
    const opened = { ...validJob, title: "AI 平台工程师", applicationEmail: "hr@firstparty.cn", sourceUrl: "https://firstparty.cn/careers/ai", applicationUrl: "https://firstparty.cn/careers/ai" };
    const viaSite = { ...validJob, title: "机器学习工程师", applicationEmail: "recruit@bigco.cn", sourceUrl: "https://careers.bigco.cn/jobs/ml", applicationUrl: "https://careers.bigco.cn/jobs/ml" };
    const uncited = { ...validJob, title: "未被引用岗位", applicationEmail: "jobs@random-uncited.cn", sourceUrl: "https://random-uncited.cn/job", applicationUrl: "https://random-uncited.cn/job" };
    const body = { output: [
      { type: "web_search_call", status: "completed", action: { type: "search", query: 'site:careers.bigco.cn "机器学习" 深圳' } },
      { type: "web_search_call", status: "completed", action: { type: "open_page", url: "https://firstparty.cn/careers/ai" } },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify([opened, viaSite, uncited]), annotations: [] }] },
    ] };
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));
    const result = await searchJobs({ text: "大模型", city: "深圳", candidate: { skills: ["Python"] } });
    expect(result.mode).toBe("live");
    // opened (open_page host) and viaSite (site: operator host) are accepted; the uncited host is rejected.
    expect(result.jobs.map((job) => job.title).sort()).toEqual(["AI 平台工程师", "机器学习工程师"]);
    expect(result.jobs.every((job) => job.applicationType === "verified_email")).toBe(true);
    expect(result.jobs.every((job) => job.applicationEmail !== null)).toBe(true);
  });

  it("accepts an uncited but reachable page (with an email) when JOBPILOT_VERIFY_URLS=1", async () => {
    configure();
    process.env.JOBPILOT_VERIFY_URLS = "1";
    // Both jobs land on hosts the model never cited (empty annotations, no matching action). Verification
    // is the only path that can admit them, and only if the URL actually answers as an existing page.
    const reachable = { ...validJob, title: "可达真实岗位", applicationEmail: "hr@reachable.cn", sourceUrl: "https://reachable-firstparty.cn/careers/1", applicationUrl: "https://reachable-firstparty.cn/careers/1" };
    const dead = { ...validJob, title: "失效岗位", applicationEmail: "hr@dead.cn", sourceUrl: "https://dead-firstparty.cn/careers/2", applicationUrl: "https://dead-firstparty.cn/careers/2" };
    const body = { output: [
      { type: "web_search_call", status: "completed", action: { type: "search", query: "AI 深圳" } },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify([reachable, dead]), annotations: [] }] },
    ] };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/responses")) return new Response(JSON.stringify(body), { status: 200 });
      if (url.startsWith("https://reachable-firstparty.cn"))
        return new Response(
          `<main>${reachable.company} ${reachable.title} 招聘邮箱 ${reachable.applicationEmail}</main>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      return new Response(null, { status: 404 }); // dead host answers 404 -> not accepted
    });
    const result = await searchJobs({ text: "大模型", city: "深圳", candidate: { skills: ["Python"] } });
    expect(result.mode).toBe("live");
    // Only the reachable host survives verification; the 404 host is dropped, not shown.
    expect(result.jobs.map((job) => job.title)).toEqual(["可达真实岗位"]);
    expect(result.jobs.every((job) => job.applicationType === "verified_email")).toBe(true);
  });

  it("accepts an uncited reachable vacancy without an email as a manual application", async () => {
    configure();
    process.env.JOBPILOT_VERIFY_URLS = "1";
    const manual = {
      ...validJob,
      title: "AI 应用工程师",
      company: "可达科技有限公司",
      applicationEmail: null,
      sourceUrl: "https://reachable-firstparty.cn/careers/manual-1",
      applicationUrl: "https://reachable-firstparty.cn/careers/manual-1/apply",
    };
    const body = { output: [
      { type: "web_search_call", status: "completed", action: { type: "search", query: "AI 深圳" } },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify([manual]), annotations: [] }] },
    ] };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/responses")) return new Response(JSON.stringify(body), { status: 200 });
      return new Response(`<main>${manual.company} 正在招聘 ${manual.title}，请通过申请入口提交材料。</main>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });

    const result = await searchJobs({ text: "AI 应用", city: "深圳", candidate: { skills: ["Python"] } });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].applicationType).toBe("official_apply");
    expect(result.jobs[0].applicationEmail).toBeNull();
    expect(result.jobs[0].source.verified).toBe(true);
  });

  it("does not verify or accept uncited jobs when the flag is unset (default)", async () => {
    configure();
    const uncited = { ...validJob, title: "未验证岗位", applicationEmail: "hr@uncited.cn", sourceUrl: "https://uncited-firstparty.cn/careers/9", applicationUrl: "https://uncited-firstparty.cn/careers/9" };
    const body = { output: [
      { type: "web_search_call", status: "completed", action: { type: "search", query: "AI 深圳" } },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify([uncited]), annotations: [] }] },
    ] };
    let verifyCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/responses")) return new Response(JSON.stringify(body), { status: 200 });
      verifyCalls += 1; return new Response(null, { status: 200 });
    });
    const result = await searchJobs({ text: "大模型", city: "深圳", candidate: { skills: ["Python"] } });
    expect(result.jobs).toEqual([]);
    expect(verifyCalls).toBe(0); // no network verification happens unless JOBPILOT_VERIFY_URLS=1
  });

  it("keeps a real vacancy without an email as an official manual application", async () => {
    configure();
    const withEmail = { ...validJob, title: "AI 工程师A", sourceUrl: "https://official.test/careers/a", applicationUrl: "https://official.test/careers/a", applicationEmail: "hr@official.test" };
    const noEmail = { ...validJob, title: "AI 工程师B", sourceUrl: "https://official.test/careers/b", applicationUrl: "https://official.test/careers/b/apply", applicationEmail: null };
    mockFetch([withEmail, noEmail], ["https://official.test/careers/a", "https://official.test/careers/b"]);
    const result = await searchJobs({ text: "大模型", city: "深圳", candidate: { skills: ["Python"] } });
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.map((job) => job.title).sort()).toEqual(["AI 工程师A", "AI 工程师B"]);
    const withEmailResult = result.jobs.find((job) => job.title === "AI 工程师A");
    const manualResult = result.jobs.find((job) => job.title === "AI 工程师B");
    expect(withEmailResult?.applicationType).toBe("verified_email");
    expect(withEmailResult?.applicationEmail).toBe("hr@official.test");
    expect(manualResult?.applicationType).toBe("official_apply");
    expect(manualResult?.applicationEmail).toBeNull();
  });
});
