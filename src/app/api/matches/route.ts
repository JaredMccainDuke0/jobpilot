import { all, id, now, one, run, transaction } from "@/infrastructure/db";
import { matchJob } from "@/domain/matching";
import { requireUser } from "@/infrastructure/auth";
import { searchJobs } from "@/infrastructure/job-search";
import { MATCH_RESULT_STORAGE_LIMIT } from "@/domain/match-visibility";

export async function POST() {
  const user = await requireUser();
  const resume = one<any>("SELECT * FROM resumes WHERE userId=? AND confirmed=1 ORDER BY updatedAt DESC LIMIT 1", user.id);
  const preference = one<any>("SELECT * FROM preferences WHERE userId=? AND confirmed=1 ORDER BY updatedAt DESC LIMIT 1", user.id);
  if (!resume || !preference || !resume.currentVersionId) return Response.json({ error: "请先确认简历和求职需求" }, { status: 400 });
  const version = one<any>("SELECT * FROM resume_versions WHERE id=? AND resumeId=?", resume.currentVersionId, resume.id);
  const candidate = JSON.parse(version.parsedJson);
  const wantedCity = String(preference.city || candidate.city || "").trim();
  const priorUrls = all<{ sourceUrl: string }>(
    `SELECT DISTINCT s.url sourceUrl
     FROM match_runs mr
     JOIN match_results r ON r.runId=mr.id
     JOIN jobs j ON j.id=r.jobId
     JOIN sources s ON s.id=j.sourceId
     WHERE mr.userId=? AND s.sourceType='model_web_search'`,
    user.id,
  ).map((item) => item.sourceUrl);
  const priorFingerprints = new Set(
    [
      ...all<{ jobFingerprint: string | null }>(
        `SELECT DISTINCT j.jobFingerprint
         FROM match_runs mr
         JOIN match_results r ON r.runId=mr.id
         JOIN jobs j ON j.id=r.jobId
         WHERE mr.userId=? AND j.jobFingerprint IS NOT NULL AND j.jobFingerprint<>''`,
        user.id,
      ),
      ...all<{ jobFingerprint: string | null }>(
        `SELECT DISTINCT j.jobFingerprint
         FROM application_tasks t
         JOIN jobs j ON j.id=t.jobId
         WHERE t.userId=? AND j.jobFingerprint IS NOT NULL AND j.jobFingerprint<>''`,
        user.id,
      ),
    ]
      .map((item) => item.jobFingerprint || "")
      .filter(Boolean),
  );
  const live = await searchJobs({
    text: preference.rawText,
    city: wantedCity,
    candidate,
    excludeUrls: priorUrls,
    excludeFingerprints: [...priorFingerprints],
  });
  const scored = live.jobs
    .map((job) => ({ job, match: matchJob(candidate, preference, job) }))
    .sort((a, b) => b.match.score - a.match.score || a.job.id.localeCompare(b.job.id))
    .slice(0, MATCH_RESULT_STORAGE_LIMIT);
  const runId = id();
  transaction(() => {
    run("INSERT INTO match_runs(id,resumeVersionId,preferenceId,createdAt,userId,searchWarning) VALUES(?,?,?,?,?,?)", runId, resume.currentVersionId, preference.id, now(), user.id, live.warning || null);
    for (const { job, match } of scored) {
      const sourceId = `source-${job.id}`;
      run(
        "INSERT OR REPLACE INTO sources(id,name,url,sourceType,verified) VALUES(?,?,?,?,?)",
        sourceId,
        job.source.name,
        job.source.url,
        job.source.sourceType,
        job.source.verified ? 1 : 0,
      );
      run(
        `INSERT OR REPLACE INTO jobs(id,title,company,city,education,graduationYear,workMode,industry,description,applicationType,applicationUrl,sourceId,applicationEmail,jobFingerprint,sourceEvidenceJson,sourceVerifiedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        job.id,
        job.title,
        job.company,
        job.city,
        job.education || null,
        job.graduationYear || null,
        job.workMode || null,
        job.industry || null,
        job.description,
        job.applicationType,
        job.applicationUrl,
        sourceId,
        job.applicationEmail || null,
        job.jobFingerprint,
        JSON.stringify(job.sourceEvidence),
        job.source.verified ? job.sourceEvidence.checkedAt : null,
      );
      run("INSERT INTO match_results VALUES(?,?,?,?,?,?,?,?,?,?)", id(), runId, job.id, match.score, match.eligible ? 1 : 0, JSON.stringify(match.reasons), JSON.stringify(match.mismatch), JSON.stringify(match.unknown), JSON.stringify(match.risks), 0);
    }
  });
  return Response.json({ ok: true, runId, count: scored.length, city: wantedCity, source: live.mode, warning: live.warning || null });
}
