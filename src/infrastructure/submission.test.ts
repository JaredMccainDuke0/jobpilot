import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailApiSubmissionAdapter, ResendSubmissionAdapter } from "./submission";

afterEach(() => {
  vi.restoreAllMocks();
});

function resumeFixture() {
  const directory = mkdtempSync(join(tmpdir(), "jobpilot-mail-test-"));
  const path = join(directory, "resume.pdf");
  writeFileSync(path, "test resume");
  return { directory, path };
}

describe("outbound email privacy headers", () => {
  it("blind-copies the Reply-To user on every platform-relayed message", async () => {
    const fixture = resumeFixture();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "message-id" }), { status: 200 }),
    );

    try {
      const result = await new ResendSubmissionAdapter({
        apiKey: "test-key",
        fromAddress: "jobpilot@relay.example",
      }).send({
        to: "recruiting@company.example",
        subject: "Application",
        text: "Hello",
        resumePath: fixture.path,
        resumeName: "resume.pdf",
        replyTo: "applicant@example.test",
        fromName: "Applicant",
        idempotencyKey: "task-platform-1",
      });

      expect(result).toMatchObject({ ok: true, reference: "resend:message-id" });
      const init = fetchMock.mock.calls[0]?.[1];
      const body = JSON.parse(String(init?.body));
      expect(body.from).toBe('"applicant@example.test via JobPilot" <jobpilot@relay.example>');
      expect(body.text).toBe("候选人联系邮箱：applicant@example.test\n直接回复本邮件即可联系候选人。\n\nHello");
      expect(body.reply_to).toBe("applicant@example.test");
      expect(body.bcc).toEqual(["applicant@example.test"]);
      expect(body.to).toEqual(["recruiting@company.example"]);
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("task-platform-1");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  it("does not add a Bcc header to Gmail API messages", async () => {
    const fixture = resumeFixture();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "gmail-message-id" }), { status: 200 }),
      );

    try {
      const result = await new GmailApiSubmissionAdapter({
        user: "sender@gmail.com",
        from: "sender@gmail.com",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token",
      }).send({
        to: "recruiting@company.example",
        subject: "Application",
        text: "Hello",
        resumePath: fixture.path,
        resumeName: "resume.pdf",
        replyTo: "sender@gmail.com",
        bcc: "copy@example.test",
        idempotencyKey: "task-gmail-1",
      });

      expect(result).toMatchObject({ ok: true, reference: "gmail:gmail-message-id" });
      const init = fetchMock.mock.calls[1]?.[1];
      const requestBody = JSON.parse(String(init?.body));
      const mime = Buffer.from(requestBody.raw, "base64url").toString("utf8");
      expect(mime).toMatch(/^Message-ID: <jobpilot-task-gmail-1@jobpilot\.local>/im);
      expect(mime).not.toMatch(/^Bcc:/im);
      expect(mime).not.toContain("copy@example.test");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });
});
