import { all, one } from "@/infrastructure/db";
import { requireUser } from "@/infrastructure/auth";
import { getEmailSender } from "@/infrastructure/email-auth";
import { MATCH_PAGE_SIZE, MATCH_RESULT_STORAGE_LIMIT } from "@/domain/match-visibility";

function parseStoredJson(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function configuredModelProvider() {
  const value = process.env.JOBPILOT_MODEL_BASE_URL;
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function requestedMatchLimit(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("matchLimit");
    return value === String(MATCH_RESULT_STORAGE_LIMIT)
      ? MATCH_RESULT_STORAGE_LIMIT
      : MATCH_PAGE_SIZE;
  } catch {
    return MATCH_PAGE_SIZE;
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const matchLimit = requestedMatchLimit(request);
    const resume = one<any>(
      "SELECT * FROM resumes WHERE userId=? ORDER BY updatedAt DESC LIMIT 1",
      user.id,
    );
    if (resume) {
      resume.confirmed = !!resume.confirmed;
      resume.versions = all(
        "SELECT * FROM resume_versions WHERE resumeId=? ORDER BY createdAt DESC LIMIT 1",
        resume.id,
      );
    }
    const preference = one(
      "SELECT * FROM preferences WHERE userId=? ORDER BY updatedAt DESC LIMIT 1",
      user.id,
    );
    const run = one<any>(
      "SELECT * FROM match_runs WHERE userId=? ORDER BY createdAt DESC LIMIT 1",
      user.id,
    );
    if (run) {
      run.results = run.consumedAt
        ? []
        : all<any>(
            `SELECT r.*,j.title,j.company,j.city,j.education,j.graduationYear,j.workMode,j.industry,j.description,j.applicationType,j.applicationUrl,j.applicationEmail,j.sourceEvidenceJson,j.sourceVerifiedAt,s.name sourceName,s.url sourceUrl,s.sourceType,s.verified sourceVerified FROM match_results r JOIN jobs j ON j.id=r.jobId JOIN sources s ON s.id=j.sourceId WHERE r.runId=? AND s.sourceType='model_web_search' ORDER BY r.score DESC LIMIT ?`,
            run.id,
            matchLimit,
          ).map((r) => ({
            ...r,
            eligible: !!r.eligible,
            selected: !!r.selected,
            job: {
              title: r.title,
              company: r.company,
              city: r.city,
              education: r.education,
              graduationYear: r.graduationYear,
              workMode: r.workMode,
              industry: r.industry,
              description: r.description,
              applicationType: r.applicationType,
              applicationUrl: r.applicationUrl,
              applicationEmail: r.applicationEmail,
              source: {
                name: r.sourceName,
                url: r.sourceUrl,
                verified: !!r.sourceVerified,
              },
              sourceEvidence: parseStoredJson(r.sourceEvidenceJson),
              sourceVerifiedAt: r.sourceVerifiedAt || null,
            },
          }));
    }
    const tasks = all<any>(
      `SELECT t.*,j.title jobTitle,j.company,j.applicationUrl,j.applicationType,j.sourceEvidenceJson,j.sourceVerifiedAt,s.verified sourceVerified
       FROM application_tasks t
       JOIN jobs j ON j.id=t.jobId
       LEFT JOIN sources s ON s.id=j.sourceId
       WHERE t.userId=? ORDER BY t.updatedAt DESC`,
      user.id,
    ).map((t) => ({
      ...t,
      sourceVerified: !!t.sourceVerified,
      sourceEvidence: parseStoredJson(t.sourceEvidenceJson),
      sourceVerifiedAt: t.sourceVerifiedAt || null,
      history: all(
        "SELECT * FROM application_history WHERE taskId=? ORDER BY createdAt",
        t.id,
      ),
    }));
    const authProvider = one<{ value: string }>(
      "SELECT value FROM user_settings WHERE userId=? AND key='authProvider'",
      user.id,
    )?.value;
    const sender = getEmailSender(user);
    return Response.json({
      user,
      resume,
      preference,
      run,
      tasks,
      loginProvider: authProvider === "google" ? "google" : "email",
      emailSender: {
        kind: sender.config?.kind || "unavailable",
        ready: !!sender.config,
        error: sender.config ? null : sender.error || "发信服务暂不可用",
      },
      modelConfigured: !!process.env.JOBPILOT_MODEL_API_KEY,
      modelProvider: configuredModelProvider(),
    });
  } catch {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
}
