import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  one: vi.fn(),
  all: vi.fn(),
  getEmailSender: vi.fn(),
}));

vi.mock("@/infrastructure/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/infrastructure/db", () => ({ one: mocks.one, all: mocks.all }));
vi.mock("@/infrastructure/email-auth", () => ({ getEmailSender: mocks.getEmailSender }));

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
});

describe("state for archived match runs", () => {
  it("keeps the run metadata but returns no old match results", async () => {
    const response = await GET();
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
});
