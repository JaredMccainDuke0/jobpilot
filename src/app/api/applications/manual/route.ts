import { createHash } from "node:crypto";
import { buildJobFingerprint } from "@/infrastructure/job-search";
import { processApplicationTask } from "@/application/process-application-task";
import { requireUser } from "@/infrastructure/auth";
import { id, now, one, run, transaction } from "@/infrastructure/db";

function cleanText(value: unknown, max = 120) {
  return String(typeof value === "string" ? value : "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function addHistory(taskId: string, status: string, reason: string) {
  run("INSERT INTO application_history VALUES(?,?,?,?,?)", id(), taskId, status, reason, now());
}

export async function POST(req: Request) {
  const user = await requireUser();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求内容无效" }, { status: 400 });
  }
  if (body?.confirmed !== true)
    return Response.json({ error: "请先在页面确认收件人和发送动作" }, { status: 400 });

  const target = cleanText(body?.to, 254).toLowerCase();
  if (!isEmail(target))
    return Response.json({ error: "请输入有效的收件邮箱" }, { status: 400 });

  const resume = one<any>(
    "SELECT * FROM resumes WHERE userId=? AND confirmed=1 ORDER BY updatedAt DESC LIMIT 1",
    user.id,
  );
  if (!resume?.currentVersionId)
    return Response.json({ error: "请先上传并确认简历" }, { status: 400 });

  const company = cleanText(body?.company, 160) || "未填写公司";
  const title = cleanText(body?.title, 160) || "指定邮箱投递";
  const fingerprint = buildJobFingerprint({
    company,
    title,
    city: "",
    applicationEmail: target,
  });
  const key = `manual:${user.id}:${resume.currentVersionId}:${fingerprint}`;
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 24);
  const jobId = `manual-job-${digest}`;
  const sourceId = `manual-source-${digest}`;

  const record = transaction(() => {
    const existing = one<{ id: string; status: string }>(
      "SELECT id,status FROM application_tasks WHERE idempotencyKey=? AND userId=?",
      key,
      user.id,
    );
    if (existing) return { created: false as const, id: existing.id, status: existing.status };

    const createdAt = now();
    const evidence = JSON.stringify({
      kind: "user_confirmed_recipient",
      recordedAt: createdAt,
      publicSourceVerified: false,
      reason: "收件人由用户在页面明确确认，不代表公开招聘来源已核验",
    });
    run(
      "INSERT OR IGNORE INTO sources(id,name,url,sourceType,verified) VALUES(?,?,?,?,0)",
      sourceId,
      "用户指定收件人",
      "manual://user-confirmed-recipient",
      "user_confirmed_recipient",
    );
    run(
      `INSERT OR IGNORE INTO jobs(id,title,company,city,education,graduationYear,workMode,industry,description,applicationType,applicationUrl,sourceId,applicationEmail,jobFingerprint,sourceEvidenceJson,sourceVerifiedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      jobId,
      title,
      company,
      "",
      null,
      null,
      null,
      null,
      "用户明确指定收件人的投递任务",
      "manual_email",
      null,
      sourceId,
      null,
      fingerprint,
      evidence,
      null,
    );
    const taskId = id();
    run(
      "INSERT INTO application_tasks(id,jobId,resumeVersionId,idempotencyKey,status,adapter,errorCode,errorSummary,attempts,createdAt,updatedAt,userId,manualRecipientEmail) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      taskId,
      jobId,
      resume.currentVersionId,
      key,
      "WAITING",
      "email",
      null,
      null,
      0,
      createdAt,
      createdAt,
      user.id,
      target,
    );
    addHistory(taskId, "WAITING", "用户确认了指定收件人，投递任务已创建");
    return { created: true as const, id: taskId, status: "WAITING" };
  });

  if (!record.created) {
    return Response.json({
      ok: record.status === "SUCCESS",
      created: false,
      alreadyHandled: true,
      taskId: record.id,
      status: record.status,
      error:
        record.status === "SUCCESS"
          ? undefined
          : "相同简历、收件人和岗位信息已有投递任务；请在投递记录中查看或重试",
    });
  }

  const result = await processApplicationTask(user, record.id);
  return Response.json({
    ok: result.ok,
    created: true,
    taskId: record.id,
    status: result.status,
    alreadyHandled: result.alreadyHandled || false,
    error: result.error,
  });
}
