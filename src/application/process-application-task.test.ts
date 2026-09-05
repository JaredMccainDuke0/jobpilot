import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  one: vi.fn(),
  transaction: vi.fn(),
  now: vi.fn(),
  id: vi.fn(),
  getEmailSender: vi.fn(),
  makeAdapter: vi.fn(),
  send: vi.fn(),
  mockSubmit: vi.fn(),
}));

vi.mock("@/infrastructure/db", () => ({
  run: mocks.run,
  one: mocks.one,
  transaction: mocks.transaction,
  now: mocks.now,
  id: mocks.id,
}));

vi.mock("@/infrastructure/email-auth", () => ({
  getEmailSender: mocks.getEmailSender,
  makeAdapter: mocks.makeAdapter,
}));

vi.mock("@/infrastructure/submission", () => ({
  MockSubmissionAdapter: class {
    submit = mocks.mockSubmit;
  },
}));

import { processApplicationTask } from "./process-application-task";

const user = { id: "user-1", email: "user@example.test", role: "user" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((fn: () => unknown) => fn());
  mocks.now.mockReturnValue("2026-08-16T00:00:00.000Z");
  mocks.id.mockReturnValue("history-1");
  mocks.run.mockReturnValue({ changes: 1 });
  mocks.getEmailSender.mockReturnValue({
    config: { kind: "resend", apiKey: "test-key", fromAddress: "sender@example.test" },
  });
  mocks.makeAdapter.mockReturnValue({ send: mocks.send });
  mocks.send.mockResolvedValue({ ok: true, reference: "sent" });
});

describe("processApplicationTask", () => {
  it("atomically claims a task and uses the resume version saved on that task", async () => {
    mocks.one.mockImplementation((sql: string) => {
      if (sql.includes("SELECT * FROM application_tasks"))
        return { id: "task-1", jobId: "job-1", resumeVersionId: "stored-version" };
      if (sql.includes("SELECT j.title"))
        return {
          title: "Engineer",
          company: "Company",
          applicationType: "verified_email",
          applicationEmail: "recruiting@example.test",
          sourceVerified: 1,
        };
      if (sql.includes("SELECT v.parsedJson"))
        return { parsedJson: JSON.stringify({ name: "Applicant" }), filePath: "C:/resume.pdf", fileName: "resume.pdf" };
      return undefined;
    });

    const result = await processApplicationTask(user, "task-1");

    expect(result).toMatchObject({ ok: true, status: "SUCCESS" });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.stringContaining("status='WAITING'"),
      "2026-08-16T00:00:00.000Z",
      "2026-08-16T00:00:00.000Z",
      "task-1",
      "user-1",
    );
    expect(mocks.one).toHaveBeenCalledWith(
      expect.stringContaining("FROM resume_versions v JOIN resumes r"),
      "stored-version",
      "user-1",
    );
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        resumePath: "C:/resume.pdf",
        resumeName: "resume.pdf",
        idempotencyKey: "task-1",
      }),
    );
    expect(mocks.run).toHaveBeenCalledWith(
      expect.stringContaining("recipientEmail=?"),
      "recruiting@example.test",
      expect.any(String),
      expect.any(String),
      expect.any(String),
      "2026-08-16T00:00:00.000Z",
      "task-1",
      "user-1",
    );
    expect(mocks.run).toHaveBeenCalledWith(
      expect.stringContaining("providerReference=COALESCE"),
      "SUCCESS",
      null,
      null,
      "sent",
      "2026-08-16T00:00:00.000Z",
      "2026-08-16T00:00:00.000Z",
      "task-1",
      "user-1",
    );
  });

  it("sends to a user-confirmed manual recipient without treating it as a verified public source", async () => {
    mocks.one.mockImplementation((sql: string) => {
      if (sql.includes("SELECT * FROM application_tasks"))
        return {
          id: "manual-task",
          jobId: "manual-job",
          resumeVersionId: "stored-version",
          manualRecipientEmail: "manual-target@example.test",
        };
      if (sql.includes("SELECT j.title"))
        return {
          title: "指定邮箱投递",
          company: "未填写公司",
          applicationType: "manual_email",
          applicationEmail: null,
          sourceVerified: 0,
          sourceEvidenceJson: JSON.stringify({ kind: "user_confirmed_recipient" }),
        };
      if (sql.includes("SELECT v.parsedJson"))
        return { parsedJson: JSON.stringify({}), filePath: "C:/resume.pdf", fileName: "resume.pdf" };
      return undefined;
    });

    const result = await processApplicationTask(user, "manual-task");

    expect(result).toMatchObject({ ok: true, status: "SUCCESS" });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "manual-target@example.test",
        idempotencyKey: "manual-task",
      }),
    );
  });

  it("does not send an unverified catalog-sourced recipient", async () => {
    mocks.one.mockImplementation((sql: string) => {
      if (sql.includes("SELECT * FROM application_tasks"))
        return { id: "task-1", jobId: "job-1", resumeVersionId: "stored-version" };
      if (sql.includes("SELECT j.title"))
        return {
          title: "Engineer",
          company: "Company",
          applicationType: "verified_email",
          applicationEmail: "recruiting@example.test",
          sourceVerified: 0,
        };
      if (sql.includes("SELECT v.parsedJson"))
        return { parsedJson: JSON.stringify({}), filePath: "C:/resume.pdf", fileName: "resume.pdf" };
      return undefined;
    });

    const result = await processApplicationTask(user, "task-1");

    expect(result).toMatchObject({ ok: false, status: "FAILED" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not send when another request already claimed the task", async () => {
    mocks.run.mockImplementation((sql: string) =>
      sql.includes("status='PROCESSING'") ? { changes: 0 } : { changes: 1 },
    );
    mocks.one.mockReturnValue({ status: "PROCESSING" });

    const result = await processApplicationTask(user, "task-1");

    expect(result).toMatchObject({ ok: false, status: "PROCESSING", httpStatus: 409, alreadyHandled: true });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.mockSubmit).not.toHaveBeenCalled();
  });
});
