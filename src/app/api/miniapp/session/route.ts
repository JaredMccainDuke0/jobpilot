import { z } from "zod";
import { one, run } from "@/infrastructure/db";
import { createBearerSession, createMiniappBindingToken, verifyMiniappBindingToken } from "@/infrastructure/auth";
import { now } from "@/infrastructure/db";

const schema = z.object({ code: z.string().min(1).max(512) });

/** Exchange wx.login code without changing the existing browser-cookie login flow. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "缺少有效的微信登录 code", code: "VALIDATION_ERROR" }, { status: 400 });
  const appId = process.env.WECHAT_MINIAPP_APP_ID;
  const appSecret = process.env.WECHAT_MINIAPP_APP_SECRET;
  if (!appId || !appSecret) return Response.json({ error: "小程序登录尚未配置", code: "UPSTREAM_UNAVAILABLE" }, { status: 503 });
  try {
    const endpoint = new URL("https://api.weixin.qq.com/sns/jscode2session");
    endpoint.search = new URLSearchParams({ appid: appId, secret: appSecret, js_code: parsed.data.code, grant_type: "authorization_code" }).toString();
    const wx = await (await fetch(endpoint, { signal: AbortSignal.timeout(10_000), cache: "no-store" })).json() as { openid?: string; unionid?: string; errcode?: number };
    if (!wx.openid) return Response.json({ error: "微信登录校验失败", code: "UNAUTHENTICATED", retryable: false }, { status: 401 });
    const existing = one<{ userId: string }>("SELECT userId FROM miniapp_accounts WHERE openid=? OR (unionid IS NOT NULL AND unionid=?)", wx.openid, wx.unionid || null);
    if (!existing) return Response.json({ ok: false, needsBinding: true, bindingToken: createMiniappBindingToken(wx.openid) }, { status: 200 });
    return Response.json({ ok: true, token: createBearerSession(existing.userId) });
  } catch { return Response.json({ error: "微信登录服务暂时不可用", code: "UPSTREAM_UNAVAILABLE", retryable: true }, { status: 503 }); }
}

const bindSchema = z.object({ bindingToken: z.string().min(1), unionid: z.string().optional(), email: z.string().email() });
export async function PUT(request: Request) {
  const parsed = bindSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "绑定信息不完整", code: "VALIDATION_ERROR" }, { status: 400 });
  const openid = verifyMiniappBindingToken(parsed.data.bindingToken);
  if (!openid) return Response.json({ error: "小程序绑定会话已失效", code: "UNAUTHENTICATED" }, { status: 401 });
  const user = one<{ id: string }>("SELECT id FROM users WHERE email=?", parsed.data.email.toLowerCase());
  if (!user) return Response.json({ error: "请先在网页端使用该邮箱登录一次", code: "CONFLICT" }, { status: 409 });
  const timestamp = now();
  run("INSERT INTO miniapp_accounts(openid,unionid,emailUserId,userId,createdAt,updatedAt) VALUES(?,?,?,?,?,?) ON CONFLICT(openid) DO UPDATE SET unionid=excluded.unionid,emailUserId=excluded.emailUserId,userId=excluded.userId,updatedAt=excluded.updatedAt", openid, parsed.data.unionid || null, parsed.data.email.toLowerCase(), user.id, timestamp, timestamp);
  return Response.json({ ok: true, token: createBearerSession(user.id) });
}
