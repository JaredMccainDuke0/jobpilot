export const APPLICATION_STATUSES = ["WAITING","PROCESSING","SUCCESS","FAILED","NEEDS_USER","CANCELLED"] as const;
export function submissionEligibility(input: { sourceVerified: boolean; resumeConfirmed: boolean; applicationType: string }) {
  if (!input.sourceVerified) return { allowed: false, status: "NEEDS_USER", reason: "职位来源尚未核验" };
  if (!input.resumeConfirmed) return { allowed: false, status: "FAILED", reason: "简历尚未确认" };
  if (input.applicationType === "verified_email") return { allowed: true, status: "WAITING", reason: "已核验邮件渠道检查通过" };
  if (input.applicationType !== "mock") return { allowed: true, status: "NEEDS_USER", reason: "此渠道需要用户在官方入口完成" };
  return { allowed: true, status: "WAITING", reason: "模拟渠道检查通过" };
}
