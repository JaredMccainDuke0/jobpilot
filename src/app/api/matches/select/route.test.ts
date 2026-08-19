import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  one: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/infrastructure/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/infrastructure/db", () => ({
  one: mocks.one,
  all: mocks.all,
  run: mocks.run,
  transaction: mocks.transaction,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", email: "user@example.test", role: "user" });
  mocks.transaction.mockImplementation((fn: () => unknown) => fn());
  mocks.one.mockImplementation((sql: string) =>
    sql.includes("SELECT r.runId") ? { runId: "run-1" } : { count: 5 },
  );
  mocks.all.mockImplementation((_sql: string, _runId: string, ...ids: string[]) =>
    ids.map((id) => ({ id })),
  );
  mocks.run.mockReturnValue({ changes: 5 });
});

describe("matched-job selection scope", () => {
  it("select-all clears the run and selects only the visible ids explicitly sent by the UI", async () => {
    const visibleIds = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"];
    const response = await POST(
      new Request("http://localhost/api/matches/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "r1", all: true, visibleIds }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenNthCalledWith(
      1,
      "UPDATE match_results SET selected=0 WHERE runId=?",
      "run-1",
    );
    expect(mocks.run).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("id IN (?,?,?,?,?,?,?,?,?,?)"),
      "run-1",
      ...visibleIds,
    );
  });

  it("rejects a scope larger than the rendered result limit", async () => {
    const response = await POST(
      new Request("http://localhost/api/matches/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "r1", all: true, visibleIds: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11"] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
