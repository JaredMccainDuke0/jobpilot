import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ one: vi.fn(), run: vi.fn() }));
const auth = vi.hoisted(() => ({ createBearerSession: vi.fn(() => "user-1.sig"), verifyBearerSession: vi.fn(() => ({ id: "user-1" })) }));
vi.mock("@/infrastructure/db", () => ({ ...db, now: vi.fn(() => "2026-08-26T00:00:00.000Z") }));
vi.mock("@/infrastructure/auth", () => auth);
import { POST, PUT } from "./route";

describe("mini-program session adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); delete process.env.WECHAT_MINIAPP_APP_ID; delete process.env.WECHAT_MINIAPP_APP_SECRET; });
  it("does not affect or pretend to support login when unconfigured", async () => {
    const response = await POST(new Request("http://localhost/api/miniapp/session", { method: "POST", body: JSON.stringify({ code: "wx-code" }) }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
  });
  it("requires a valid bearer session and matching existing email for binding", async () => {
    const response = await PUT(new Request("http://localhost/api/miniapp/session", { method: "PUT", body: JSON.stringify({ token: "user-1.sig", openid: "openid-1", email: "owner@example.com" }) }));
    expect(response.status).toBe(409);
    expect(db.run).not.toHaveBeenCalled();
  });
});
