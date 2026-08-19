import { createHash } from "node:crypto";
import { buildApplicationEmail } from "@/domain/application-email";
import { getEmailSender, makeAdapter } from "@/infrastructure/email-auth";
import { id, now, one, run, transaction } from "@/infrastructure/db";
import { MockSubmissionAdapter } from "@/infrastructure/submission";

type User = { id: string; email: string; role: string };
type TaskStatus = "WAITING" | "PROCESSING" | "SUCCESS" | "FAILED" | "NEEDS_USER" | "CANCELLED";

export type ProcessApplicationResult = {
  ok: boolean;
  status: TaskStatus;
  error?: string;
  httpStatus?: number;
  alreadyHandled?: boolean;
};

function addHistory(taskId: string, status: TaskStatus, reason: string) {
  run("INSERT INTO application_history VALUES(?,?,?,?,?)", id(), taskId, status, reason, now());
}

function safeSummary(value: unknown, fallback: string) {
  const text = String(value || fallback).replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, 300);
}

function errorCode(summary: string) {
  if (/状态未知|超时/.test(summary)) return "DELIVERY_UNKNOWN";
  if (/Google|Gmail|授权|过期|401|invalid_grant/i.test(summary)) return "AUTH_REQUIRED";
  if (/429|额度|quota|limit|rate/i.test(summary)) return "RATE_LIMITED";
  if (/平台代发|Resend/i.test(summary)) return "PLATFORM_SEND_FAILED";
  return "SEND_FAILED";
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function finishTask(
  userId: string,
  taskId: string,
  status: "SUCCESS" | "FAILED",
  summary?: string,
  code?: string,
  receipt?: { reference?: string },
) {
  const reason = status === "SUCCESS" ? "邮件服务已接收投递请求" : safeSummary(summary, "投递失败");
  const submittedAt = status === "SUCCESS" ? now() : null;
  transaction(() => {
    run(
      "UPDATE application_tasks SET status=?,errorCode=?,errorSummary=?,providerReference=COALESCE(?,providerReference),submittedAt=COALESCE(?,submittedAt),processingStartedAt=NULL,updatedAt=? WHERE id=? AND userId=? AND status='PROCESSING'",
      status,
      status === "FAILED" ? code || "SEND_FAILED" : null,
      status === "FAILED" ? reason : null,
      receipt?.reference || null,
      submittedAt,
      now(),
      taskId,
      userId,
    );
    addHistory(taskId, status, reason);
  });
  return { ok: status === "SUCCESS", status, error: status === "FAILED" ? reason : undefined } satisfies ProcessApplicationResult;
}

export async function processApplicationTask(user: User, taskId: string): Promise<ProcessApplicationResult> {
  const claimed = transaction(() => {
    const startedAt = now();
    const result = run(
      "UPDATE application_tasks SET status='PROCESSING',attempts=attempts+1,errorCode=NULL,errorSummary=NULL,processingStartedAt=?,updatedAt=? WHERE id=? AND userId=? AND status='WAITING'",
      startedAt,
      startedAt,
      taskId,
      user.id,
    );
    if (Number(result.changes) !== 1) return false;
    addHistory(taskId, "PROCESSING", "投递任务已认领");
    return true;
  });

  if (!claimed) {
    const current = one<{ status: TaskStatus; errorSummary?: string }>(
      "SELECT status,errorSummary FROM application_tasks WHERE id=? AND userId=?",
      taskId,
      user.id,
    );
    if (!current) return { ok: false, status: "FAILED", error: "任务不存在", httpStatus: 404 };
    if (current.status === "SUCCESS") return { ok: true, status: "SUCCESS", alreadyHandled: true };
    return {
      ok: false,
      status: current.status,
      error: current.errorSummary || (current.status === "PROCESSING" ? "任务已在处理中，请稍后刷新" : "当前任务状态不能发送"),
      httpStatus: 409,
      alreadyHandled: true,
    };
  }

  try {
    const task = one<any>("SELECT * FROM application_tasks WHERE id=? AND userId=?", taskId, user.id);
    const job = task
      ? one<any>(
          "SELECT j.title,j.company,j.applicationType,j.applicationEmail,j.sourceEvidenceJson,s.verified sourceVerified FROM jobs j JOIN sources s ON s.id=j.sourceId WHERE j.id=?",
          task.jobId,
        )
      : null;
    const resume = task
      ? one<any>(
          "SELECT v.parsedJson,r.filePath,r.fileName FROM resume_versions v JOIN resumes r ON r.id=v.resumeId WHERE v.id=? AND r.userId=?",
          task.resumeVersionId,
          user.id,
        )
      : null;

    if (!task || !job || !resume?.filePath || !resume?.fileName)
      return finishTask(user.id, taskId, "FAILED", "任务关联的岗位或简历版本已不可用", "TASK_DATA_MISSING");
    const manualRecipient = String(task.manualRecipientEmail || "").trim().toLowerCase();
    const userConfirmedRecipient = isEmail(manualRecipient);
    if (!userConfirmedRecipient && !job.sourceVerified)
      return finishTask(user.id, taskId, "FAILED", "职位来源尚未核验，已停止自动投递", "SOURCE_NOT_VERIFIED");

    let response: { ok: boolean; reference?: string; error?: string };
    if (job.applicationType === "mock" && !userConfirmedRecipient) {
      response = await new MockSubmissionAdapter().submit(task.id);
    } else if (userConfirmedRecipient || (job.applicationType === "verified_email" && job.applicationEmail)) {
      const recipient = userConfirmedRecipient ? manualRecipient : String(job.applicationEmail).trim().toLowerCase();
      const sender = getEmailSender(user);
      if (!sender.config)
        return finishTask(user.id, taskId, "FAILED", sender.error || "真实邮件渠道暂不可用", "CHANNEL_UNAVAILABLE");

      let candidate: any = {};
      try {
        candidate = resume.parsedJson ? JSON.parse(resume.parsedJson) : {};
      } catch {
        candidate = {};
      }
      const mail = buildApplicationEmail(candidate, { title: job.title, company: job.company });
      const sourceEvidence =
        task.sourceEvidenceJson ||
        job.sourceEvidenceJson ||
        JSON.stringify({
          kind: userConfirmedRecipient ? "user_confirmed_recipient" : "missing_source_evidence",
          recordedAt: now(),
          publicSourceVerified: !!job.sourceVerified,
        });
      transaction(() => {
        run(
          "UPDATE application_tasks SET recipientEmail=?,messageSubject=?,messageBodyHash=?,sourceEvidenceJson=?,updatedAt=? WHERE id=? AND userId=? AND status='PROCESSING'",
          recipient,
          mail.subject,
          createHash("sha256").update(mail.text).digest("hex"),
          sourceEvidence,
          now(),
          taskId,
          user.id,
        );
      });
      response = await makeAdapter(sender.config).send({
        to: recipient,
        subject: mail.subject,
        text: mail.text,
        resumePath: resume.filePath,
        resumeName: resume.fileName,
        replyTo: user.email,
        fromName: candidate.name || undefined,
        bcc: sender.config.kind === "resend" ? user.email : undefined,
        idempotencyKey: task.id,
      });
    } else {
      return finishTask(user.id, taskId, "FAILED", "该岗位没有可直接投递的公开招聘邮箱", "CHANNEL_NOT_AUTOMATIC");
    }

    if (response.ok) return finishTask(user.id, taskId, "SUCCESS", undefined, undefined, { reference: response.reference });
    const summary = safeSummary(response.error, "投递失败");
    return finishTask(user.id, taskId, "FAILED", summary, errorCode(summary));
  } catch {
    return finishTask(user.id, taskId, "FAILED", "投递处理异常，请稍后重试", "TASK_PROCESSING_ERROR");
  }
}
