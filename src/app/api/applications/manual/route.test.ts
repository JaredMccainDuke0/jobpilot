import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  one: vi.fn(),
  run: vi.fn(),
  transaction: vi.fn(),
  id: vi.fn(),
  now: vi.fn(),
  buildJobFingerprint: vi.fn(),
  processApplicationTask: vi.fn(),
}));

vi.mock("@/infrastructure/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/infrastructure/db", () => ({
  one: mocks.one,
  run: mocks.run,
  transaction: mocks.transaction,
  id: mocks.id,
  now: mocks.now,
}));
vi.mock("@/infrastructure/job-search", () => ({
  buildJobFingerprint: mocks.buildJobFingerprint,
}));
vi.mock("@/application/process-application-task", () => ({
  processApplicationTask: mocks.processApplicationTask,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1", email: "user@example.test", role: "user" });
  mocks.one.mockImplementation((sql: string) => {
    if (sql.includes("SELECT * FROM resumes"))
      return { currentVersionId: "resume-version-1" };
    return undefined;
  });
  mocks.transaction.mockImplementation((fn: () => unknown) => fn());
  mocks.id.mockReturnValueOnce("task-1").mockReturnValue("history-1");
  mocks.now.mockReturnValue("2026-08-17T00:00:00.000Z");
  mocks.buildJobFingerprint.mockReturnValue("manual-fingerprint");
  mocks.processApplicationTask.mockResolvedValue({ ok: true, status: "SUCCESS" });
});

describe("manual application tasks", () => {
  it("requires an in-page confirmation before creating a task", async () => {
    const response = await POST(
      new Request("http://localhost/api/applications/manual", {
        method: "POST",
        body: JSON.stringify({ to: "recruiting@example.test" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.processApplicationTask).not.toHaveBeenCalled();
  });

  it("creates a durable, idempotent task before invoking the shared processor", async () => {
    const response = await POST(
      new Request("http://localhost/api/applications/manual", {
        method: "POST",
        body: JSON.stringify({
          confirmed: true,
          to: "recruiting@example.test",
          company: "Test Company",
          title: "Engineer",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, created: true, taskId: "task-1", status: "SUCCESS" });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.stringContaining("manualRecipientEmail"),
      "task-1",
      expect.any(String),
      "resume-version-1",
      expect.any(String),
      "WAITING",
      "email",
      null,
      null,
      0,
      "2026-08-17T00:00:00.000Z",
      "2026-08-17T00:00:00.000Z",
      "user-1",
      "recruiting@example.test",
    );
    expect(mocks.processApplicationTask).toHaveBeenCalledWith(
      { id: "user-1", email: "user@example.test", role: "user" },
      "task-1",
    );
  });

  it("reuses an existing successful task instead of sending the same request again", async () => {
    mocks.one.mockImplementation((sql: string) => {
      if (sql.includes("SELECT * FROM resumes"))
        return { currentVersionId: "resume-version-1" };
      if (sql.includes("SELECT id,status FROM application_tasks"))
        return { id: "existing-task", status: "SUCCESS" };
      return undefined;
    });

    const response = await POST(
      new Request("http://localhost/api/applications/manual", {
        method: "POST",
        body: JSON.stringify({ confirmed: true, to: "recruiting@example.test" }),
      }),
    );
    const body = await response.json();

    expect(body).toMatchObject({ ok: true, created: false, alreadyHandled: true, taskId: "existing-task" });
    expect(mocks.processApplicationTask).not.toHaveBeenCalled();
  });
});
