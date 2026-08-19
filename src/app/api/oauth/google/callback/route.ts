import { NextRequest, NextResponse } from "next/server";
import { encryptUserSecret, findOrCreateOAuthUser, sessionCookie } from "@/infrastructure/auth";
import { now, run } from "@/infrastructure/db";
import { emailFromIdToken, exchangeCode, publicBaseUrl, redirectUri } from "@/infrastructure/oauth-google";

// Google redirects here after consent. We verify the CSRF state, exchange the code for a refresh token,
// learn the connected address, then LOG THE USER IN (find/create by that email) and store the token so the
// same account can send via Gmail. One flow = both login and send-authorization.
export async function GET(request: NextRequest) {
  const base = publicBaseUrl(request);
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${base}/invite?authError=${reason}`);
    res.cookies.delete("g_oauth_state");
    return res;
  };
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("google_denied");
  const code = params.get("code");
  const state = params.get("state");
  const cookieState = request.cookies.get("g_oauth_state")?.value;
  if (!code || !state || !cookieState || state !== cookieState) return fail("google_state");
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("google_unconfigured");

  const exchanged = await exchangeCode({ code, clientId, clientSecret, redirectUri: redirectUri(request) });
  if (!exchanged.ok) return fail("google_token");
  const email = emailFromIdToken(exchanged.data.id_token);
  const refreshToken = exchanged.data.refresh_token;
  if (!refreshToken || !email) return fail("google_norefresh");

  const userId = findOrCreateOAuthUser(email);
  encryptUserSecret(userId, "googleRefreshToken", refreshToken);
  const set = (key: string, value: string) =>
    run("INSERT INTO user_settings VALUES(?,?,?,?) ON CONFLICT(userId,key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt", userId, key, value, now());
  set("authProvider", "google");

  const res = NextResponse.redirect(`${base}/`);
  const cookie = sessionCookie(userId);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  res.cookies.delete("g_oauth_state");
  return res;
}
