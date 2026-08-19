import { randomBytes } from "node:crypto";

// Gmail send-only + identity. gmail.send is the narrowest scope that lets us send on the user's behalf;
// openid+email lets us learn which address they connected (stored as the From/User).
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"].join(" ");

// Public origin the OAuth redirect must return to. Fixed via JOBPILOT_PUBLIC_URL so it matches the exact
// redirect URI registered in Google Cloud (Google requires an exact match); falls back to request headers.
export function publicBaseUrl(request: Request) {
  const envUrl = process.env.JOBPILOT_PUBLIC_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

export function redirectUri(request: Request) {
  return `${publicBaseUrl(request)}/api/oauth/google/callback`;
}

export function buildAuthUrl(params: { clientId: string; redirectUri: string; state: string }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline"); // ask for a refresh token
  url.searchParams.set("prompt", "consent"); // force refresh_token issuance on re-connect
  url.searchParams.set("state", params.state);
  return url.toString();
}

export async function exchangeCode(params: { code: string; clientId: string; clientSecret: string; redirectUri: string }) {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false as const, status: res.status };
    return { ok: true as const, data: (await res.json()) as { refresh_token?: string; access_token?: string; id_token?: string } };
  } catch {
    return { ok: false as const, status: 504 };
  }
}

// Read the verified email out of Google's id_token. The token came straight from Google's token endpoint
// over TLS in the code-exchange response, so we decode (not re-verify) its payload.
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  const part = idToken.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return typeof json.email === "string" ? json.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function randomState() {
  return randomBytes(16).toString("hex");
}

// Exchange a stored refresh token for a short-lived access token (used by the Gmail API send adapter).
export async function googleAccessToken(params: { clientId: string; clientSecret: string; refreshToken: string }) {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    refresh_token: params.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token || null;
}
