import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  one: vi.fn(),
  all: vi.fn(),
  getEmailSender: vi.fn(),
  getCatalogStatus: vi.fn(),
}));

vi.mock("@/infrastructure/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/infrastructure/db", () => ({ one: mocks.one, all: mocks.all }));
vi.mock("@/infrastructure/email-auth", () => ({ getEmailSender: mocks.getEmailSender }));
vi.mock("@/infrastructure/job-catalog", () => ({ getCatalogStatus: mocks.getCatalogStatus }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", email: "user@example.test", role: "user" });
  mocks.one.mockImplementation((sql: string) => {
    if (sql.includes("FROM match_runs"))
      return { id: "run-1", consumedAt: "2026-08-16T12:00:00.000Z" };
    return undefined;
  });
  mocks.all.mockImplementation((sql: string) => {
    if (sql.includes("FROM application_tasks t"))
      return [{ id: "task-1", status: "SUCCESS", updatedAt: "2026-08-16T12:00:00.000Z" }];
    return [];
  });
  mocks.getEmailSender.mockReturnValue({ config: null, error: "unavailable" });
  mocks.getCatalogStatus.mockReturnValue({
    configured: false,
    sourceCount: 0,
    enabledSourceCount: 0,
    activeJobCount: 0,
    freshJobCount: 0,
    lastRefreshAt: null,
    lastSuccessAt: null,
    lastStatus: "disabled",
    lastError: null,
    nextRefreshAt: null,
    refreshIntervalMinutes: 60,
    staleAfterHours: 48,
  });
});

describe("state for archived match runs", () => {
  it("keeps the run metadata but returns no old match results", async () => {
    const response = await GET(new Request("http://localhost/api/state"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run).toMatchObject({ id: "run-1", consumedAt: "2026-08-16T12:00:00.000Z", results: [] });
    expect(body.tasks).toEqual([
      expect.objectContaining({ id: "task-1", status: "SUCCESS", history: [] }),
    ]);
    expect(
      mocks.all.mock.calls.some(([sql]) => String(sql).includes("FROM match_results r JOIN jobs")),
    ).toBe(false);
  });

  it("keeps the shared default response at one page for mini-program compatibility", async () => {
    mocks.one.mockImplementation((sql: string) => {
      if (sql.includes("FROM match_runs")) return { id: "run-active", consumedAt: null };
      return undefined;
    });
    mocks.all.mockImplementation((sql: string) => {
      if (sql.includes("FROM match_results r JOIN jobs")) return [];
      if (sql.includes("FROM application_tasks t")) return [];
      return [];
    });

    const response = await GET(new Request("http://localhost/api/state"));

    expect(response.status).toBe(200);
    expect(mocks.all).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY r.score DESC LIMIT ?"),
      "run-active",
      expect.any(String),
      expect.any(String),
      10,
    );
  });

  it("allows the web client to opt into thirty results for local pagination", async () => {
    mocks.one.mockImplementation((sql: string) => {
      if (sql.includes("FROM match_runs")) return { id: "run-active", consumedAt: null };
      return undefined;
    });
    mocks.all.mockImplementation((sql: string) => {
      if (sql.includes("FROM match_results r JOIN jobs")) return [];
      if (sql.includes("FROM application_tasks t")) return [];
      return [];
    });

    const response = await GET(new Request("http://localhost/api/state?matchLimit=30"));

    expect(response.status).toBe(200);
    expect(mocks.all).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY r.score DESC LIMIT ?"),
      "run-active",
      expect.any(String),
      expect.any(String),
      30,
    );
  });
});
