import { processApplicationTask } from "@/application/process-application-task";
import { requireUser } from "@/infrastructure/auth";

export async function POST(req: Request) {
  const user = await requireUser();
  let taskId = "";
  try {
    const body = await req.json();
    taskId = typeof body?.id === "string" ? body.id.trim() : "";
  } catch {
    taskId = "";
  }
  if (!taskId) return Response.json({ error: "缺少投递任务编号" }, { status: 400 });

  const result = await processApplicationTask(user, taskId);
  const { httpStatus, ...body } = result;
  return Response.json(body, { status: httpStatus || 200 });
}
