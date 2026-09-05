import { describe, expect, it } from "vitest";
import { catalogWebSearchConfig, catalogWebSearchPlans } from "@/domain/job-catalog";
import { citedHostsFromResponse, collectWebSearchPlan } from "./job-catalog-web";

describe("background web catalog plans", () => {
  it("builds bounded generic plans without candidate personal data", () => {
    const config = catalogWebSearchConfig({
      JOBPILOT_CATALOG_WEB_SEARCH: "1",
      JOBPILOT_MODEL_BASE_URL: "https://model.example/v1",
      JOBPILOT_MODEL_API_KEY: "server-only-key",
      JOBPILOT_MODEL_NAME: "catalog-model",
      JOBPILOT_CATALOG_CITIES: "广州,深圳",
      JOBPILOT_CATALOG_ROLE_FAMILIES: "AI,算法,通信,后端",
      JOBPILOT_CATALOG_WEB_SEARCH_MAX_QUERIES: "3",
    });
    const plans = catalogWebSearchPlans(config);
    expect(config.enabled).toBe(true);
    expect(plans).toHaveLength(3);
    expect(plans[0]).toMatchObject({ city: "广州", roles: ["AI", "算法", "通信"] });
    expect(JSON.stringify(plans)).not.toContain("server-only-key");
  });

  it("collects hosts from annotations, opened pages, and site operators", () => {
    const hosts = citedHostsFromResponse({
      output: [
        { type: "message", content: [{ type: "output_text", annotations: [{ url: "https://careers.acme.com/job/1" }] }] },
        { type: "web_search_call", action: { type: "open_page", url: "https://jobs.example.org/2" } },
        { type: "web_search_call", action: { type: "search", query: "site:careers.other.com AI engineer" } },
      ],
    });
    expect(hosts).toEqual(new Set(["careers.acme.com", "jobs.example.org", "careers.other.com"]));
  });

  it("keeps only jobs whose public page confirms the planned city", async () => {
    const sourceUrl = "https://93.184.216.34/jobs/ai-1";
    const jobs = [
      {
        title: "AI Engineer",
        company: "Acme",
        city: "广州",
        education: null,
        graduationYear: null,
        workMode: null,
        industry: "AI",
        description: "Build production AI services and maintain the engineering platform.",
        applicationEmail: null,
        applicationUrl: sourceUrl,
        sourceName: "Acme careers",
        sourceUrl,
        publishedAt: "2026-09-03T00:00:00Z",
        updatedAt: null,
        expiresAt: null,
      },
      {
        title: "Backend Engineer",
        company: "Acme",
        city: "深圳",
        education: null,
        graduationYear: null,
        workMode: null,
        industry: "Backend",
        description: "Build reliable backend services and maintain the engineering platform.",
        applicationEmail: null,
        applicationUrl: "https://93.184.216.34/jobs/backend-1",
        sourceName: "Acme careers",
        sourceUrl: "https://93.184.216.34/jobs/backend-1",
        publishedAt: "2026-09-03T00:00:00Z",
        updatedAt: null,
        expiresAt: null,
      },
    ];
    let call = 0;
    const result = await collectWebSearchPlan(
      { id: "web-guangzhou-1", city: "广州", roles: ["AI"], name: "广州 AI" },
      {
        baseUrl: "https://model.example/v1",
        model: "catalog-model",
        key: "server-only-key",
        requestTimeoutMs: 10000,
        fetchImpl: async () => {
          call += 1;
          if (call === 1) {
            return new Response(JSON.stringify({
              output: [
                { type: "web_search_call", status: "completed", action: { url: sourceUrl } },
                { type: "message", content: [{ type: "output_text", text: JSON.stringify(jobs) }] },
              ],
            }), { status: 200 });
          }
          return new Response("Acme AI Engineer 广州 招聘：负责生产 AI 服务和工程平台。", { status: 200 });
        },
      },
    );
    expect(result.fetchedCount).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ title: "AI Engineer", city: "广州", sourceVerified: true });
  });
});
