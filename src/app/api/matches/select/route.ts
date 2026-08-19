import { MATCH_RESULT_LIMIT, normalizeVisibleResultIds } from "@/domain/match-visibility";
import { requireUser } from "@/infrastructure/auth";
import { all, one, run, transaction } from "@/infrastructure/db";

export async function POST(req: Request) {
  const user = await requireUser();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求内容无效" }, { status: 400 });
  }

  const resultId = typeof body?.id === "string" ? body.id.trim() : "";
  if (!resultId || !Array.isArray(body?.visibleIds) || body.visibleIds.length > MATCH_RESULT_LIMIT)
    return Response.json({ error: "可见岗位范围无效，请刷新页面后重试" }, { status: 400 });

  const anchor = one<{ runId: string }>(
    "SELECT r.runId FROM match_results r JOIN match_runs m ON m.id=r.runId WHERE r.id=? AND m.userId=?",
    resultId,
    user.id,
  );
  if (!anchor) return Response.json({ error: "结果不存在" }, { status: 404 });

  const visibleIds = normalizeVisibleResultIds(body.visibleIds);
  if (!visibleIds.length || !visibleIds.includes(resultId))
    return Response.json({ error: "可见岗位范围无效，请刷新页面后重试" }, { status: 400 });
  const placeholders = visibleIds.map(() => "?").join(",");
  const validIds = all<{ id: string }>(
    `SELECT id FROM match_results WHERE runId=? AND id IN (${placeholders})`,
    anchor.runId,
    ...visibleIds,
  );
  if (validIds.length !== visibleIds.length)
    return Response.json({ error: "部分岗位已变化，请刷新页面后重试" }, { status: 409 });

  if (typeof body.all === "boolean") {
    transaction(() => {
      run("UPDATE match_results SET selected=0 WHERE runId=?", anchor.runId);
      if (body.all)
        run(
          `UPDATE match_results SET selected=1 WHERE runId=? AND id IN (${placeholders})`,
          anchor.runId,
          ...visibleIds,
        );
    });
  } else if (typeof body.selected === "boolean") {
    transaction(() => {
      run(
        `UPDATE match_results SET selected=0 WHERE runId=? AND id NOT IN (${placeholders})`,
        anchor.runId,
        ...visibleIds,
      );
      run("UPDATE match_results SET selected=? WHERE id=? AND runId=?", body.selected ? 1 : 0, resultId, anchor.runId);
    });
  } else {
    return Response.json({ error: "缺少岗位选择状态" }, { status: 400 });
  }

  const count = one<{ count: number }>(
    "SELECT COUNT(*) count FROM match_results WHERE runId=? AND selected=1",
    anchor.runId,
  )?.count;
  return Response.json({ ok: true, selectedCount: Number(count || 0) });
}
