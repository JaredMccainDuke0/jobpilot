import { one } from "./db";
import { decryptUserSecret } from "./auth";
import { GmailApiSubmissionAdapter, ResendSubmissionAdapter, SubmissionAdapter, SendInput } from "./submission";

// Resolved outbound-email configuration for one user.
//  - kind "gmail_api": Gmail via the Gmail API (narrow gmail.send scope; SMTP needs full mail scope).
//  - kind "resend": central platform sender (one domain sends for everyone; zero per-user config).
export type EmailSenderConfig =
  | { kind: "gmail_api"; user: string; from: string; clientId: string; clientSecret: string; refreshToken: string }
  | { kind: "resend"; apiKey: string; fromAddress: string };

// Is the shared platform sender (Resend) configured on this server?
export function platformSenderReady() {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_ADDRESS;
}

// Decide how this user sends mail: their own connected mailbox if they have one, otherwise the shared
// platform sender (zero config). Returns a friendly reason when nothing is available.
export function getEmailSender(user: { id: string; email: string; role: string }): { config: EmailSenderConfig | null; error?: string } {
  const authProvider = one<{ value: string }>(
    "SELECT value FROM user_settings WHERE userId=? AND key='authProvider'",
    user.id,
  )?.value;

  if (authProvider === "google") {
    const refreshToken = decryptUserSecret(user.id, "googleRefreshToken");
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (refreshToken && clientId && clientSecret)
      return { config: { kind: "gmail_api", user: user.email, from: user.email, clientId, clientSecret, refreshToken } };
    return { config: null, error: "Gmail 授权不完整或已过期，请重新用 Google 登录" };
  }

  // Zero-config default: the shared platform domain sends on the user's behalf.
  if (platformSenderReady())
    return { config: { kind: "resend", apiKey: process.env.RESEND_API_KEY!, fromAddress: process.env.RESEND_FROM_ADDRESS! } };

  return { config: null, error: "平台发信服务暂未就绪，请联系站点管理员" };
}

// Build the right adapter for a resolved config.
export function makeAdapter(config: EmailSenderConfig): SubmissionAdapter & { verify(): Promise<{ ok: boolean; error?: string }>; send(input: SendInput): Promise<{ ok: boolean; reference?: string; error?: string }> } {
  if (config.kind === "gmail_api") return new GmailApiSubmissionAdapter(config);
  return new ResendSubmissionAdapter(config);
}
