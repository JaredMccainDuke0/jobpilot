import { NextResponse } from "next/server";
import { buildAuthUrl, publicBaseUrl, randomState, redirectUri } from "@/infrastructure/oauth-google";

// Start Gmail OAuth. This is BOTH login and send-authorization, so it does not require an existing
// session — only the site gate (enforced by middleware). Google's consent page collects the password.
export async function GET(request: Request) {
  const base = publicBaseUrl(request);
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(`${base}/invite?authError=google_unconfigured`);
  const state = randomState();
  const res = NextResponse.redirect(buildAuthUrl({ clientId, redirectUri: redirectUri(request), state }));
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
