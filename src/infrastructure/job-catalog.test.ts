import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  all: vi.fn(),
  id: vi.fn(),
  now: vi.fn(),
  one: vi.fn(),
  run: vi.fn(),
  transaction: vi.fn(),
  isPublicConfiguredUrl: vi.fn(),
  isSafeConfiguredUrl: vi.fn(),
  parseFeedPayload: vi.fn(),
}));

vi.mock("@/infrastructure/db", () => ({
  all: mocks.all,
  id: mocks.id,
  now: mocks.now,
  one: mocks.one,
  run: mocks.run,
  transaction: mocks.transaction,
}));
vi.mock("@/infrastructure/job-catalog-feeds", () => ({
  isPublicConfiguredUrl: mocks.isPublicConfiguredUrl,
  isSafeConfiguredUrl: mocks.isSafeConfiguredUrl,
  normalizeFeedConfigs: vi.fn(),
  parseFeedPayload: mocks.parseFeedPayload,
}));

import { searchCatalogJobs, refreshJobCatalog } from "./job-catalog";

const feed = {
  id: "feed-1",
  kind: "json" as const,
  name: "Example careers",
  url: "https://jobs.example.com/feed.json",
  enabled: true,
  official: true,
  company: "Example",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.id.mockReturnValue("catalog-run-1");
  mocks.now.mockReturnValue("2026-09-04T00:00:00.000Z");
  mocks.run.mockReturnValue({ changes: 0 });
  mocks.transaction.mockImplementation((fn: () => unknown) => fn());
  mocks.one.mockReturnValue(undefined);
  mocks.all.mockReturnValue([]);
  mocks.isPublicConfiguredUrl.mockResolvedValue(true);
  mocks.isSafeConfiguredUrl.mockReturnValue(true);
});

describe("job catalog refresh", () => {
  it("keeps current feed items, rejects stale items, and records a refresh run", async () => {
    mocks.parseFeedPayload.mockReturnValue([
      {
        externalId: "job-1",
        title: "AI Engineer",
        company: "Example",
        city: "深圳",
        description: "Build machine learning services and production systems.",
        applicationUrl: "https://jobs.example.com/1",
        sourceUrl: "https://jobs.example.com/1",
        publishedAt: "2026-09-03T00:00:00Z",
      },
      {
        externalId: "old-1",
        title: "Old Engineer",
        company: "Example",
        city: "深圳",
        description: "This vacancy is outside the catalog retention window.",
        applicationUrl: "https://jobs.example.com/old",
        sourceUrl: "https://jobs.example.com/old",
        publishedAt: "2020-01-01T00:00:00Z",
      },
    ]);
    const result = await refreshJobCatalog({
      feeds: [feed],
      at: new Date("2026-09-04T00:00:00Z"),
      owner: "test-owner",
      includeWebSearch: false,
      fetchImpl: async () => new Response("{}", { status: 200, headers: { etag: "v1" } }),
    });
    expect(result).toMatchObject({ status: "success", sourceCount: 1, fetchedCount: 2, acceptedCount: 1, rejectedCount: 1 });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO catalog_refresh_runs"),
      "catalog-run-1",
      expect.any(String),
      expect.any(String),
      "success",
      1,
      2,
      1,
      1,
      0,
      null,
    );
  });

  it("fails closed when configured source IDs collide", async () => {
    const result = await refreshJobCatalog({
      feeds: [feed, { ...feed, url: "https://jobs.example.com/other.json" }],
      at: new Date("2026-09-04T00:00:00Z"),
      owner: "test-owner",
      includeWebSearch: false,
      fetchImpl: async () => new Response("{}", { status: 200 }),
    });
    expect(result.status).toBe("failed");
    expect(result.errors[0]).toContain("岗位源 ID 重复");
    expect(mocks.run.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO catalog_sources"))).toBe(false);
  });
});

describe("local catalog search", () => {
  it("returns only fresh catalog jobs and never calls a model adapter", () => {
    const row = {
      id: "catalog-job-1",
      title: "AI Engineer",
      company: "Example",
      city: "深圳",
      description: "Build machine learning services and production systems.",
      applicationType: "verified_email",
      applicationEmail: "jobs@example.com",
      applicationUrl: "https://jobs.example.com/1",
      jobFingerprint: "example|aiengineer|深圳|jobsexamplecom",
      sourceId: "catalog-source-1",
      sourceName: "Example careers",
      sourceUrl: "https://jobs.example.com/1",
      sourceVerified: 1,
      sourceEvidenceJson: "{\"kind\":\"catalog_feed\"}",
      lastSeenAt: "2026-09-04T00:00:00.000Z",
      publishedAt: "2026-09-03T00:00:00.000Z",
      expiresAt: null,
    };
    mocks.all.mockImplementation((sql: string) => {
      if (sql.includes("FROM jobs j JOIN sources")) return [row];
      if (sql.includes("SELECT enabled FROM catalog_sources")) return [{ enabled: 1 }];
      return [];
    });
    mocks.one.mockImplementation((sql: string) => {
      if (sql.includes("lastSeenAt>=") && sql.includes("COUNT(*)")) return { count: 1 };
      if (sql.includes("COUNT(*) count FROM jobs WHERE catalogState='active'")) return { count: 1 };
      if (sql.includes("catalog_refresh_runs ORDER")) return { status: "success", finishedAt: "2026-09-04T00:00:00.000Z" };
      if (sql.includes("status='success'")) return { finishedAt: "2026-09-04T00:00:00.000Z" };
      return undefined;
    });
    const result = searchCatalogJobs({ text: "AI", city: "深圳", candidate: {} });
    expect(result.mode).toBe("catalog");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({ title: "AI Engineer", applicationEmail: "jobs@example.com" });
    expect(result.catalog.freshJobCount).toBe(1);
  });
});
