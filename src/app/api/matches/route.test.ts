import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  one: vi.fn(),
  all: vi.fn(),
  id: vi.fn(),
  now: vi.fn(),
  run: vi.fn(),
  transaction: vi.fn(),
  searchJobs: vi.fn(),
  matchJob: vi.fn(),
}));

vi.mock("@/infrastructure/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/infrastructure/db", () => ({
  one: mocks.one,
  all: mocks.all,
  id: mocks.id,
  now: mocks.now,
  run: mocks.run,
  transaction: mocks.transaction,
}));
vi.mock("@/infrastructure/job-search", () => ({ searchJobs: mocks.searchJobs }));
vi.mock("@/domain/matching", () => ({ matchJob: mocks.matchJob }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", email: "user@example.test", role: "user" });
  mocks.one.mockImplementation((sql: string) => {
    if (sql.includes("FROM resumes"))
      return { id: "resume-1", currentVersionId: "version-1" };
    if (sql.includes("FROM preferences"))
      return { id: "preference-1", city: "深圳", rawText: "AI 工程" };
    if (sql.includes("FROM resume_versions"))
      return { parsedJson: JSON.stringify({ skills: ["Python"], city: "深圳" }) };
    return undefined;
  });
  mocks.all.mockReturnValue([]);
  mocks.id.mockReturnValueOnce("run-1").mockReturnValue("match-result-1");
  mocks.now.mockReturnValue("2026-08-17T00:00:00.000Z");
  mocks.transaction.mockImplementation((fn: () => unknown) => fn());
  mocks.matchJob.mockReturnValue({
    score: 88,
    eligible: true,
    reasons: ["技能匹配"],
    mismatch: [],
    unknown: [],
    risks: [],
  });
  mocks.searchJobs.mockResolvedValue({
    mode: "live",
    warning: undefined,
    jobs: [
      {
        id: "job-1",
        title: "AI Engineer",
        company: "Test Company",
        city: "深圳",
        education: null,
        graduationYear: null,
        workMode: null,
        industry: null,
        description: "负责人工智能应用开发、模型集成和工程化交付。",
        applicationType: "verified_email",
        applicationEmail: "recruiting@example.test",
        applicationUrl: "https://careers.example.test/jobs/1",
        sourceName: "官方招聘页",
        sourceUrl: "https://careers.example.test/jobs/1",
        jobFingerprint: "test-company|ai engineer|深圳|recruiting@example.test",
        sourceEvidence: {
          status: "unverified",
          checkedAt: "2026-08-17T00:00:00.000Z",
          url: "https://careers.example.test/jobs/1",
          emailFound: false,
          titleFound: false,
          companyFound: false,
          reason: "页面暂不可读",
        },
        source: {
          name: "官方招聘页",
          url: "https://careers.example.test/jobs/1",
          sourceType: "model_web_search",
          verified: false,
        },
      },
    ],
  });
});

describe("match persistence", () => {
  it("stores the actual source-verification state, fingerprint, and evidence snapshot", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, count: 1, runId: "run-1" });
    expect(mocks.searchJobs).toHaveBeenCalledWith(
      expect.objectContaining({ excludeFingerprints: [] }),
    );
    expect(mocks.run).toHaveBeenCalledWith(
      "INSERT OR REPLACE INTO sources(id,name,url,sourceType,verified) VALUES(?,?,?,?,?)",
      "source-job-1",
      "官方招聘页",
      "https://careers.example.test/jobs/1",
      "model_web_search",
      0,
    );
    expect(mocks.run).toHaveBeenCalledWith(
      expect.stringContaining("jobFingerprint,sourceEvidenceJson,sourceVerifiedAt"),
      "job-1",
      "AI Engineer",
      "Test Company",
      "深圳",
      null,
      null,
      null,
      null,
      "负责人工智能应用开发、模型集成和工程化交付。",
      "verified_email",
      "https://careers.example.test/jobs/1",
      "source-job-1",
      "recruiting@example.test",
      "test-company|ai engineer|深圳|recruiting@example.test",
      expect.stringContaining("\"status\":\"unverified\""),
      null,
    );
  });
});
