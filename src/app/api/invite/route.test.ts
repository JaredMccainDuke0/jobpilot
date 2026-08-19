import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  findOrCreateOAuthUser: vi.fn(),
  setSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock("@/infrastructure/auth", () => auth);

import { POST } from "./route";

describe("email sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.findOrCreateOAuthUser.mockReturnValue("user-1");
  });

  it("allows a Gmail address to use direct sign-in", async () => {
    const response = await POST(new Request("http://localhost/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "User.Name@Gmail.com" }),
    }));

    expect(response.status).toBe(200);
    expect(auth.findOrCreateOAuthUser).toHaveBeenCalledWith("user.name@gmail.com");
    expect(auth.setSession).toHaveBeenCalledWith("user-1");
  });

  it("still rejects an invalid email address", async () => {
    const response = await POST(new Request("http://localhost/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    }));

    expect(response.status).toBe(400);
    expect(auth.findOrCreateOAuthUser).not.toHaveBeenCalled();
  });
});
