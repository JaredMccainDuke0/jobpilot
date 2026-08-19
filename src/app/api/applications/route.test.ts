import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  one: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
  transaction: vi.fn(),
  id: vi.fn(),
  now: vi.fn(),
}));

vi.mock("@/infrastructure/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/infrastructure/db", () => ({
  one: mocks.one,
  all: mocks.all,
  run: mocks.run,
  transaction: mocks.transaction,
  id: mocks.id,
  now: mocks.now,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", email: "user@example.test", role: "user" });
  mocks.one.mockImplementation((sql: string) => {
    if (sql.includes("SELECT id,consumedAt FROM match_runs")) return { id: "run-1", consumedAt: null };
    if (sql.includes("SELECT currentVersionId FROM resumes")) return { currentVersionId: "version-1" };
    return undefined;
  });
  mocks.all.mockReturnValue([]);
  mocks.transaction.mockImplementation((fn: () => unknown) => fn());
  mocks.run.mockReturnValue({ changes: 1 });
  mocks.id.mockReturnValue("task-1");
  mocks.now.mockReturnValue("2026-08-16T12:00:00.000Z");
});

describe("application task creation scope", () => {
  it("only queries selected jobs inside the bounded results rendered to the user", async () => {
    const response = await POST();

    expect(response.status).toBe(400);
    expect(mocks.all).toHaveBeenCalledWith(
      expect.stringContaining("SELECT id FROM match_results WHERE runId=? ORDER BY score DESC LIMIT ?"),
      "run-1",
      "run-1",
      10,
    );
  });

  it("archives the current match run in the same transaction that creates tasks", async () => {
    mocks.all.mockReturnValue([
      {
        jobId: "job-1",
        applicationType: "official_apply",
        applicationEmail: null,
        verified: 1,
      },
    ]);

    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith(
      "UPDATE match_runs SET consumedAt=? WHERE id=? AND userId=? AND consumedAt IS NULL",
      "2026-08-16T12:00:00.000Z",
      "run-1",
      "user-1",
    );
  });

  it("rejects repeated confirmation of an archived match run", async () => {
    mocks.one.mockImplementation((sql: string) => {
      if (sql.includes("SELECT id,consumedAt FROM match_runs"))
        return { id: "run-1", consumedAt: "2026-08-16T12:00:00.000Z" };
      if (sql.includes("SELECT currentVersionId FROM resumes"))
        return { currentVersionId: "version-1" };
      return undefined;
    });

    const response = await POST();

    expect(response.status).toBe(409);
    expect(mocks.all).not.toHaveBeenCalled();
  });
});
