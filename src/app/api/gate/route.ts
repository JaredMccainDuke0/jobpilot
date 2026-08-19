import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";

const GATE_COOKIE = "jobpilot_gate";
const secret = () => process.env.JOBPILOT_SESSION_SECRET || "";
// Signed marker value; middleware checks presence, and the value is not trivially forgeable.
const gateToken = () => `ok.${createHmac("sha256", secret()).update("gate-ok").digest("hex")}`;
const schema = z.object({ password: z.string().min(1) });

function accessValid(value: string) {
  const expected = process.env.JOBPILOT_ACCESS_PASSWORD_HASH;
  if (!expected) return false; // fail closed when unset
  const actual = createHash("sha256").update(value).digest("hex");
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "请输入访问密码" }, { status: 400 });
  if (!accessValid(parsed.data.password)) return Response.json({ error: "访问密码不正确" }, { status: 401 });
  (await cookies()).set(GATE_COOKIE, gateToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 2592000,
    path: "/",
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  (await cookies()).delete(GATE_COOKIE);
  return Response.json({ ok: true });
}
