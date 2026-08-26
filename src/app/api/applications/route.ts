import { submissionEligibility } from "@/domain/application";
import { MATCH_SELECTION_LIMIT } from "@/domain/match-visibility";
import { requireUser } from "@/infrastructure/auth";
import { all, id, now, one, run, transaction } from "@/infrastructure/db";

function addHistory(taskId: string, status: string, reason: string) {
  run("INSERT INTO application_history VALUES(?,?,?,?,?)", id(), taskId, status, reason, now());
}

export async function POST() {
  const user = await requireUser();
  const latest = one<any>(
    "SELECT id,consumedAt FROM match_runs WHERE userId=? ORDER BY createdAt DESC LIMIT 1",
    user.id,
  );
  const resume = one<any>(
    "SELECT currentVersionId FROM resumes WHERE userId=? AND confirmed=1 ORDER BY updatedAt DESC LIMIT 1",
    user.id,
  );
  if (!latest || !resume?.currentVersionId)
    return Response.json({ error: "没有可确认的已选职位" }, { status: 400 });
  if (latest.consumedAt)
    return Response.json({ error: "本轮岗位已经完成确认，请刷新搜索下一批岗位" }, { status: 409 });

  const results = all<any>(
    `SELECT r.jobId,j.applicationType,j.applicationEmail,s.verified
     FROM match_results r
     JOIN jobs j ON j.id=r.jobId
     JOIN sources s ON s.id=j.sourceId
     WHERE r.runId=?
       AND r.selected=1
       AND s.sourceType='model_web_search'
       AND r.id IN (
         SELECT id FROM match_results WHERE runId=? ORDER BY score DESC LIMIT ?
       )
     ORDER BY r.score DESC`,
    latest.id,
    latest.id,
    MATCH_SELECTION_LIMIT,
  );
  if (!results.length)
    return Response.json({ error: "没有可确认的已选职位" }, { status: 400 });

  const tasks = transaction(() => {
    const created = results.map((item) => {
      const gate =
        item.applicationType === "verified_email" && !item.applicationEmail
          ? { allowed: false, status: "NEEDS_USER", reason: "该岗位没有可直接投递的公开招聘邮箱" }
          : submissionEligibility({
              sourceVerified: !!item.verified,
              resumeConfirmed: true,
              applicationType: item.applicationType,
            });
      const key = `${user.id}:${item.jobId}:${resume.currentVersionId}:${item.applicationType}`;
      let task = one<any>(
        "SELECT id,status FROM application_tasks WHERE idempotencyKey=? AND userId=?",
        key,
        user.id,
      );
      if (!task) {
        const taskId = id();
        const time = now();
        run(
          "INSERT INTO application_tasks(id,jobId,resumeVersionId,idempotencyKey,status,adapter,errorCode,errorSummary,attempts,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
          taskId,
          item.jobId,
          resume.currentVersionId,
          key,
          gate.status,
          item.applicationType === "mock"
            ? "mock"
            : item.applicationType === "verified_email" && gate.status === "WAITING"
              ? "email"
              : "manual",
          null,
          null,
          0,
          time,
          time,
          user.id,
        );
        addHistory(taskId, gate.status, gate.reason);
        task = { id: taskId, status: gate.status };
      }
      return task;
    });
    run(
      "UPDATE match_runs SET consumedAt=? WHERE id=? AND userId=? AND consumedAt IS NULL",
      now(),
      latest.id,
      user.id,
    );
    return created;
  });

  return Response.json({
    ok: true,
    count: tasks.length,
    taskIds: tasks.filter((task) => task.status === "WAITING").map((task) => task.id),
    statuses: tasks.map((task) => ({ id: task.id, status: task.status })),
  });
}

export async function PATCH(req: Request) {
  const user = await requireUser();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求内容无效" }, { status: 400 });
  }
  const taskId = typeof body?.id === "string" ? body.id.trim() : "";
  const action = body?.action;
  if (!taskId || !["retry", "cancel", "manual"].includes(action))
    return Response.json({ error: "不支持的任务操作" }, { status: 400 });

  const task = one<any>("SELECT * FROM application_tasks WHERE id=? AND userId=?", taskId, user.id);
  if (!task) return Response.json({ error: "任务不存在" }, { status: 404 });

  if (action === "retry") {
    if (task.adapter !== "email" || !["FAILED", "NEEDS_USER"].includes(task.status))
      return Response.json({ error: "当前任务状态不能重试" }, { status: 409 });
    const job = one<any>(
      "SELECT j.applicationType,j.applicationEmail,s.verified sourceVerified FROM jobs j JOIN sources s ON s.id=j.sourceId WHERE j.id=?",
      task.jobId,
    );
    const version = one<any>(
      "SELECT v.id FROM resume_versions v JOIN resumes r ON r.id=v.resumeId WHERE v.id=? AND r.userId=?",
      task.resumeVersionId,
      user.id,
    );
    const manualRecipient = String(task.manualRecipientEmail || "").trim();
    const hasConfirmedManualRecipient = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(manualRecipient);
    const hasVerifiedPublicRecipient =
      !!job &&
      job.applicationType === "verified_email" &&
      !!job.applicationEmail &&
      !!job.sourceVerified;
    if (!version || (!hasConfirmedManualRecipient && !hasVerifiedPublicRecipient))
      return Response.json({ error: "无法重试：原投递简历或收件渠道已不可用" }, { status: 400 });

    transaction(() => {
      run(
        "UPDATE application_tasks SET status='WAITING',errorCode=NULL,errorSummary=NULL,updatedAt=? WHERE id=? AND userId=? AND status IN ('FAILED','NEEDS_USER')",
        now(),
        taskId,
        user.id,
      );
      addHistory(taskId, "WAITING", "用户请求重试，任务已重新排队");
    });
    return Response.json({ ok: true, status: "WAITING" });
  }

  const allowedStatuses = action === "cancel" ? ["WAITING"] : ["WAITING", "FAILED"];
  if (!allowedStatuses.includes(task.status))
    return Response.json({ error: "当前任务状态不能执行此操作" }, { status: 409 });
  const nextStatus = action === "cancel" ? "CANCELLED" : "NEEDS_USER";
  transaction(() => {
    run(
      "UPDATE application_tasks SET status=?,updatedAt=? WHERE id=? AND userId=? AND status=?",
      nextStatus,
      now(),
      taskId,
      user.id,
      task.status,
    );
    addHistory(taskId, nextStatus, action === "cancel" ? "用户取消任务" : "用户改为手动处理");
  });
  return Response.json({ ok: true, status: nextStatus });
}
