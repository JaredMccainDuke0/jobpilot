import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { all, id, one, run, transaction } from "@/infrastructure/db";
import { buildJobFingerprint, stableJobId } from "@/domain/job-identity";
import {
  ageCutoff,
  CATALOG_SOURCE_TYPE,
  catalogWebSearchConfig,
  catalogSettings,
  freshnessCutoff,
  inferWorkMode,
  isCurrentCatalogItem,
  normalizeCatalogDate,
  normalizeCatalogEmail,
  type CatalogFeedConfig,
  type CatalogSettings,
  type NormalizedCatalogJob,
} from "@/domain/job-catalog";
import { sameCity } from "@/domain/matching";
import {
  isPublicConfiguredUrl,
  isSafeConfiguredUrl,
  normalizeFeedConfigs,
  parseFeedPayload,
} from "@/infrastructure/job-catalog-feeds";
import type { RawCatalogItem } from "@/domain/job-catalog";
import {
  collectWebSearchPlan,
  webSearchIsConfigured,
  webSearchPlansWithSources,
} from "@/infrastructure/job-catalog-web";
import { MATCH_RESULT_STORAGE_LIMIT, MATCH_RESULT_TARGET } from "@/domain/match-visibility";

const LOCK_NAME = "job-catalog-refresh";
const LOCK_LEASE_MS = 20 * 60 * 1000;

export type CatalogStatus = {
  configured: boolean;
  sourceCount: number;
  enabledSourceCount: number;
  activeJobCount: number;
  freshJobCount: number;
  lastRefreshAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  nextRefreshAt: string | null;
  refreshIntervalMinutes: number;
  staleAfterHours: number;
};

export type CatalogMatchJob = {
  id: string;
  title: string;
  company: string;
  city: string;
  education: string | null;
  graduationYear: number | null;
  workMode: string | null;
  industry: string | null;
  description: string;
  applicationEmail: string | null;
  applicationType: "verified_email" | "official_apply";
  applicationUrl: string;
  jobFingerprint: string;
  publishedAt: string | null;
  expiresAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceEvidence: Record<string, unknown> | null;
  source: {
    id: string;
    name: string;
    url: string;
    sourceType: typeof CATALOG_SOURCE_TYPE;
    verified: boolean;
  };
};

type CatalogSearchQuery = {
  text: string;
  city?: string | null;
  candidate: Record<string, unknown>;
  excludeUrls?: string[];
  excludeFingerprints?: string[];
};

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type RefreshSummary = {
  runId: string;
  status: "success" | "partial" | "failed" | "disabled" | "skipped";
  startedAt: string;
  finishedAt: string;
  sourceCount: number;
  fetchedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  expiredCount: number;
  errors: string[];
};

function cleanText(value: unknown, max: number) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function stripMarkup(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUrl(value: string) {
  return value.replace(/[?#].*$/, "").replace(/\/$/, "");
}

function sourceIdFor(config: CatalogFeedConfig, sourceUrl: string) {
  return stableJobId("catalog-source", `${config.id}|${sourceUrl}`);
}

function contentHash(job: NormalizedCatalogJob) {
  return createHash("sha256")
    .update(JSON.stringify(job))
    .digest("hex");
}

function normalizeCatalogItem(raw: RawCatalogItem, config: CatalogFeedConfig): NormalizedCatalogJob | null {
  const title = cleanText(raw.title, 240);
  const company = cleanText(raw.company || config.company, 240);
  const city = cleanText(raw.city || config.city, 120);
  const description = cleanText(stripMarkup(String(raw.description || "")), 8000);
  const sourceUrl = cleanText(raw.sourceUrl, 2000);
  const applicationUrl = cleanText(raw.applicationUrl || sourceUrl, 2000);
  if (title.length < 2 || company.length < 2 || city.length < 2 || description.length < 20) return null;
  if (!isSafeConfiguredUrl(sourceUrl) || !isSafeConfiguredUrl(applicationUrl)) return null;
  const graduationYear = Number.parseInt(String(raw.graduationYear || ""), 10);
  const item: NormalizedCatalogJob = {
    externalId: cleanText(raw.externalId || sourceUrl, 300),
    title,
    company,
    city,
    education: cleanText(raw.education, 120) || null,
    graduationYear: Number.isInteger(graduationYear) && graduationYear >= 1900 && graduationYear <= 2200 ? graduationYear : null,
    workMode: inferWorkMode(raw.workMode, description),
    industry: cleanText(raw.industry, 160) || null,
    description,
    applicationEmail: normalizeCatalogEmail(raw.applicationEmail),
    applicationUrl,
    sourceUrl,
    sourceName: cleanText(raw.sourceName || config.name, 200),
    sourceVerified: raw.sourceVerified,
    sourceEvidence: raw.sourceEvidence || null,
    publishedAt: normalizeCatalogDate(raw.publishedAt),
    updatedAt: normalizeCatalogDate(raw.updatedAt),
    expiresAt: normalizeCatalogDate(raw.expiresAt),
  };
  return item;
}

function catalogSourceEvidence(job: NormalizedCatalogJob, config: CatalogFeedConfig, checkedAt: string) {
  const sourceVerified = job.sourceVerified ?? config.official;
  return {
    ...(job.sourceEvidence || {}),
    kind: job.sourceEvidence?.kind || "catalog_feed",
    status: sourceVerified ? "verified" : "unverified",
    checkedAt,
    url: job.sourceUrl,
    emailFound: !!job.applicationEmail,
    titleFound: true,
    companyFound: true,
    publishedAt: job.publishedAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt,
    sourceKey: config.id,
    sourceOfficial: sourceVerified,
  } satisfies Record<string, unknown>;
}

async function readBounded(response: Response, maxBytes: number) {
  if (!response.body) return (await response.text()).slice(0, maxBytes);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const next = await reader.read();
      if (next.done) break;
      const remaining = Math.min(next.value.byteLength, maxBytes - bytes);
      bytes += remaining;
      chunks.push(decoder.decode(next.value.slice(0, remaining), { stream: bytes < maxBytes }));
      if (remaining < next.value.byteLength) break;
    }
    return chunks.join("");
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function loadConfiguredFeeds(env: Record<string, string | undefined> = process.env) {
  const inline = env.JOBPILOT_JOB_FEEDS?.trim();
  if (inline) {
    try {
      return normalizeFeedConfigs(JSON.parse(inline));
    } catch {
      throw new Error("岗位源配置无效");
    }
  }
  const configuredPath = path.join(process.cwd(), "config", "job-feeds.json");
  try {
    const content = await readFile(path.resolve(configuredPath), "utf8");
    return normalizeFeedConfigs(JSON.parse(content));
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw new Error("岗位源配置无效");
  }
}

export { loadConfiguredFeeds as loadCatalogFeedConfigs };

async function fetchFeed(
  config: CatalogFeedConfig,
  settings: CatalogSettings,
  fetchImpl: FetchLike,
) {
  let currentUrl = config.url;
  if (!(await isPublicConfiguredUrl(currentUrl))) throw new Error("岗位源地址不安全或无法确认是公开地址");
  const previous = one<{ etag?: string; lastModified?: string }>(
    "SELECT etag,lastModified FROM catalog_sources WHERE id=?",
    config.id,
  );
  const headers: Record<string, string> = { "User-Agent": "JobPilotCatalog/1.0" };
  if (previous?.etag) headers["If-None-Match"] = previous.etag;
  if (previous?.lastModified) headers["If-Modified-Since"] = previous.lastModified;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetchImpl(currentUrl, {
      method: "GET",
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(settings.requestTimeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("岗位源重定向次数过多或缺少目标地址");
      currentUrl = new URL(location, currentUrl).toString();
      if (!(await isPublicConfiguredUrl(currentUrl))) throw new Error("岗位源重定向到了不安全地址");
      continue;
    }
    if (response.status === 304) return { notModified: true, items: [] as RawCatalogItem[], response };
    if (!response.ok) throw new Error(`岗位源返回 HTTP ${response.status}`);
    const contentLength = Number.parseInt(response.headers.get("content-length") || "", 10);
    if (Number.isFinite(contentLength) && contentLength > settings.maxFeedBytes)
      throw new Error("岗位源响应超过大小限制");
    const body = await readBounded(response, settings.maxFeedBytes);
    return { notModified: false, items: parseFeedPayload(config, body), response };
  }
  throw new Error("岗位源重定向失败");
}

function acquireLease(owner: string, at: Date) {
  const current = one<{ owner: string; leaseUntil: string }>(
    "SELECT owner,leaseUntil FROM catalog_locks WHERE name=?",
    LOCK_NAME,
  );
  if (current && current.owner !== owner && Date.parse(current.leaseUntil) > at.getTime()) return false;
  run(
    "INSERT OR REPLACE INTO catalog_locks(name,owner,leaseUntil,updatedAt) VALUES(?,?,?,?)",
    LOCK_NAME,
    owner,
    new Date(at.getTime() + LOCK_LEASE_MS).toISOString(),
    at.toISOString(),
  );
  return true;
}

function releaseLease(owner: string) {
  run("DELETE FROM catalog_locks WHERE name=? AND owner=?", LOCK_NAME, owner);
}

function upsertCatalogJob(job: NormalizedCatalogJob, config: CatalogFeedConfig, checkedAt: string) {
  const fingerprint = buildJobFingerprint(job);
  const existing = one<{ id: string; firstSeenAt: string | null }>(
    "SELECT id,firstSeenAt FROM jobs WHERE catalogSourceKey=? AND catalogExternalId=? LIMIT 1",
    config.id,
    job.externalId,
  ) || one<{ id: string; firstSeenAt: string | null }>(
    "SELECT id,firstSeenAt FROM jobs WHERE jobFingerprint=? AND catalogState IN ('active','expired','rejected') LIMIT 1",
    fingerprint,
  );
  const jobId = existing?.id || stableJobId("catalog-job", `${config.id}|${job.externalId}|${fingerprint}`);
  const sourceId = sourceIdFor(config, job.sourceUrl);
  const evidence = JSON.stringify(catalogSourceEvidence(job, config, checkedAt));
  const sourceVerified = job.sourceVerified ?? config.official;
  const applicationType = sourceVerified && job.applicationEmail ? "verified_email" : "official_apply";
  const firstSeenAt = existing?.firstSeenAt || checkedAt;
  run(
    "INSERT OR IGNORE INTO sources(id,name,url,sourceType,verified) VALUES(?,?,?,?,?)",
    sourceId,
    job.sourceName || config.name,
    job.sourceUrl,
    CATALOG_SOURCE_TYPE,
    sourceVerified ? 1 : 0,
  );
  run(
    "UPDATE sources SET name=?,url=?,sourceType=?,verified=? WHERE id=?",
    job.sourceName || config.name,
    job.sourceUrl,
    CATALOG_SOURCE_TYPE,
    sourceVerified ? 1 : 0,
    sourceId,
  );
  run(
    `INSERT OR IGNORE INTO jobs(
      id,title,company,city,education,graduationYear,workMode,industry,description,
      applicationType,applicationUrl,sourceId,applicationEmail,jobFingerprint,
      sourceEvidenceJson,sourceVerifiedAt,catalogState,catalogSourceKey,catalogExternalId,
      publishedAt,expiresAt,firstSeenAt,lastSeenAt,lastCheckedAt,contentHash
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    jobId,
    job.title,
    job.company,
    job.city,
    job.education,
    job.graduationYear,
    job.workMode,
    job.industry,
    job.description,
    applicationType,
    job.applicationUrl,
    sourceId,
    job.applicationEmail,
    fingerprint,
    evidence,
    sourceVerified ? checkedAt : null,
    "active",
    config.id,
    job.externalId,
    job.publishedAt,
    job.expiresAt,
    firstSeenAt,
    checkedAt,
    checkedAt,
    contentHash(job),
  );
  run(
    `UPDATE jobs SET title=?,company=?,city=?,education=?,graduationYear=?,workMode=?,industry=?,description=?,
      applicationType=?,applicationUrl=?,sourceId=?,applicationEmail=?,jobFingerprint=?,sourceEvidenceJson=?,
      sourceVerifiedAt=?,catalogState='active',catalogSourceKey=?,catalogExternalId=?,publishedAt=?,expiresAt=?,
      firstSeenAt=?,lastSeenAt=?,lastCheckedAt=?,contentHash=? WHERE id=?`,
    job.title,
    job.company,
    job.city,
    job.education,
    job.graduationYear,
    job.workMode,
    job.industry,
    job.description,
    applicationType,
    job.applicationUrl,
    sourceId,
    job.applicationEmail,
    fingerprint,
    evidence,
    sourceVerified ? checkedAt : null,
    config.id,
    job.externalId,
    job.publishedAt,
    job.expiresAt,
    firstSeenAt,
    checkedAt,
    checkedAt,
    contentHash(job),
    jobId,
  );
  return jobId;
}

function markRejectedItem(raw: RawCatalogItem, config: CatalogFeedConfig, checkedAt: string) {
  const externalId = cleanText(raw.externalId || raw.sourceUrl, 300);
  if (!externalId) return;
  run(
    "UPDATE jobs SET catalogState='expired',lastCheckedAt=? WHERE catalogSourceKey=? AND catalogExternalId=? AND catalogState='active'",
    checkedAt,
    config.id,
    externalId,
  );
}

function storeCatalogItems(rawItems: RawCatalogItem[], config: CatalogFeedConfig, checkedAt: string, at: Date, settings: CatalogSettings) {
  let acceptedCount = 0;
  let rejectedCount = 0;
  transaction(() => {
    for (const raw of rawItems) {
      const normalized = normalizeCatalogItem(raw, config);
      if (!normalized || !isCurrentCatalogItem(normalized, at, settings.maxAgeDays)) {
        rejectedCount += 1;
        markRejectedItem(raw, config, checkedAt);
        continue;
      }
      upsertCatalogJob(normalized, config, checkedAt);
      acceptedCount += 1;
    }
  });
  return { acceptedCount, rejectedCount };
}

function expireAndPrune(at: Date, settings: CatalogSettings) {
  const timestamp = at.toISOString();
  const stale = freshnessCutoff(at, settings.staleAfterHours);
  const expired = run(
    `UPDATE jobs SET catalogState='expired',lastCheckedAt=?
     WHERE catalogState='active' AND (
       (expiresAt IS NOT NULL AND expiresAt<=?) OR
       (lastSeenAt IS NULL OR lastSeenAt<?)
     )`,
    timestamp,
    timestamp,
    stale,
  );
  const overflow = all<{ id: string }>(
    "SELECT id FROM jobs WHERE catalogState='active' ORDER BY lastSeenAt DESC LIMIT -1 OFFSET ?",
    settings.maxActiveJobs,
  );
  for (const item of overflow) {
    run("UPDATE jobs SET catalogState='expired',lastCheckedAt=? WHERE id=? AND catalogState='active'", timestamp, item.id);
  }
  const retention = ageCutoff(at, settings.retentionDays);
  run(
    `DELETE FROM jobs
     WHERE catalogState IN ('expired','rejected')
       AND COALESCE(lastCheckedAt,lastSeenAt,firstSeenAt)<?
       AND NOT EXISTS (SELECT 1 FROM match_results WHERE jobId=jobs.id)
       AND NOT EXISTS (SELECT 1 FROM application_tasks WHERE jobId=jobs.id)`,
    retention,
  );
  return Number(expired.changes || 0) + overflow.length;
}

function updateSourceSuccess(config: CatalogFeedConfig, checkedAt: string, response: Response, itemCount: number) {
  run(
    `UPDATE catalog_sources SET etag=?,lastModified=?,lastFetchedAt=?,lastSuccessAt=?,lastError=NULL,lastItemCount=?,updatedAt=? WHERE id=?`,
    response.headers.get("etag"),
    response.headers.get("last-modified"),
    checkedAt,
    checkedAt,
    itemCount,
    checkedAt,
    config.id,
  );
}

function updateSourceNotModified(config: CatalogFeedConfig, checkedAt: string) {
  run(
    "UPDATE catalog_sources SET lastFetchedAt=?,lastSuccessAt=?,lastError=NULL,updatedAt=? WHERE id=?",
    checkedAt,
    checkedAt,
    checkedAt,
    config.id,
  );
  run("UPDATE jobs SET lastSeenAt=?,lastCheckedAt=? WHERE catalogSourceKey=? AND catalogState='active'", checkedAt, checkedAt, config.id);
}

function updateSourceFailure(config: CatalogFeedConfig, checkedAt: string, error: string) {
  run("UPDATE catalog_sources SET lastFetchedAt=?,lastError=?,updatedAt=? WHERE id=?", checkedAt, error.slice(0, 300), checkedAt, config.id);
}

function sourceConfigErrors(feeds: CatalogFeedConfig[], webSources: CatalogFeedConfig[]) {
  const configuredSources = [...feeds, ...webSources];
  const counts = new Map<string, number>();
  for (const source of configuredSources) counts.set(source.id, (counts.get(source.id) || 0) + 1);
  const duplicateIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([sourceId]) => sourceId)
    .sort();
  const reservedIds = feeds
    .filter((source) => source.id.startsWith("catalog-web-"))
    .map((source) => source.id)
    .sort();
  const errors: string[] = [];
  if (duplicateIds.length) errors.push(`岗位源 ID 重复，刷新已停止：${duplicateIds.join(", ")}`);
  if (reservedIds.length) errors.push(`岗位源 ID 使用了后台采集保留前缀：${reservedIds.join(", ")}`);
  return errors;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function refreshOneSource(config: CatalogFeedConfig, settings: CatalogSettings, fetchImpl: FetchLike, at: Date) {
  const checkedAt = at.toISOString();
  const fetched = await fetchFeed(config, settings, fetchImpl);
  if (fetched.notModified) {
    updateSourceNotModified(config, checkedAt);
    return { fetchedCount: 0, acceptedCount: 0, rejectedCount: 0 };
  }
  const { acceptedCount, rejectedCount } = storeCatalogItems(fetched.items, config, checkedAt, at, settings);
  updateSourceSuccess(config, checkedAt, fetched.response, fetched.items.length);
  return { fetchedCount: fetched.items.length, acceptedCount, rejectedCount };
}

function catalogRunRecord(summary: RefreshSummary) {
  run(
    `INSERT INTO catalog_refresh_runs(id,startedAt,finishedAt,status,sourceCount,fetchedCount,acceptedCount,rejectedCount,expiredCount,errorSummary)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    summary.runId,
    summary.startedAt,
    summary.finishedAt,
    summary.status,
    summary.sourceCount,
    summary.fetchedCount,
    summary.acceptedCount,
    summary.rejectedCount,
    summary.expiredCount,
    summary.errors.length ? summary.errors.join("; ").slice(0, 1000) : null,
  );
}

export async function refreshJobCatalog(options: {
  feeds?: CatalogFeedConfig[];
  settings?: CatalogSettings;
  at?: Date;
  owner?: string;
  fetchImpl?: FetchLike;
  includeWebSearch?: boolean;
} = {}): Promise<RefreshSummary> {
  const at = options.at || new Date();
  const startedAt = at.toISOString();
  const runId = id();
  const settings = options.settings || catalogSettings();
  let feeds: CatalogFeedConfig[];
  try {
    feeds = options.feeds || await loadConfiguredFeeds();
  } catch (error: any) {
    const finishedAt = new Date().toISOString();
    const summary: RefreshSummary = {
      runId, status: "failed", startedAt, finishedAt, sourceCount: 0,
      fetchedCount: 0, acceptedCount: 0, rejectedCount: 0, expiredCount: 0,
      errors: [error?.message || "岗位源配置无效"],
    };
    catalogRunRecord(summary);
    return summary;
  }
  const webPlans = options.includeWebSearch === false || !webSearchIsConfigured()
    ? []
    : webSearchPlansWithSources();
  const webSources = webPlans.map((item) => item.source);
  const configuredSources = [...feeds, ...webSources];
  const sourceErrors = sourceConfigErrors(feeds, webSources);
  if (sourceErrors.length) {
    const summary: RefreshSummary = {
      runId,
      status: "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      sourceCount: configuredSources.length,
      fetchedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      expiredCount: 0,
      errors: sourceErrors,
    };
    catalogRunRecord(summary);
    return summary;
  }
  const enabledFeeds = configuredSources.filter((feed) => feed.enabled);
  transaction(() => {
    for (const feed of configuredSources) {
      run(
        `INSERT INTO catalog_sources(id,kind,name,url,official,enabled,updatedAt)
         VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,url=excluded.url,
         official=excluded.official,enabled=excluded.enabled,updatedAt=excluded.updatedAt`,
        feed.id,
        feed.kind,
        feed.name,
        feed.url,
        feed.official ? 1 : 0,
        feed.enabled ? 1 : 0,
        startedAt,
      );
    }
    if (configuredSources.length) {
      const placeholders = configuredSources.map(() => "?").join(",");
      run(`UPDATE catalog_sources SET enabled=0,updatedAt=? WHERE id NOT IN (${placeholders})`, startedAt, ...configuredSources.map((feed) => feed.id));
    } else {
      run("UPDATE catalog_sources SET enabled=0,updatedAt=?", startedAt);
    }
  });
  if (!enabledFeeds.length) {
    const summary: RefreshSummary = {
      runId, status: "disabled", startedAt, finishedAt: new Date().toISOString(),
      sourceCount: configuredSources.length, fetchedCount: 0, acceptedCount: 0, rejectedCount: 0,
      expiredCount: 0, errors: [],
    };
    catalogRunRecord(summary);
    return summary;
  }
  const owner = options.owner || `catalog-${process.pid}-${Math.random().toString(36).slice(2)}`;
  if (!transaction(() => acquireLease(owner, at))) {
    return {
      runId, status: "skipped", startedAt, finishedAt: new Date().toISOString(),
      sourceCount: enabledFeeds.length, fetchedCount: 0, acceptedCount: 0,
      rejectedCount: 0, expiredCount: 0, errors: ["已有岗位库刷新任务正在运行"],
    };
  }
  const fetchImpl = options.fetchImpl || fetch;
  let fetchedCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  const errors: string[] = [];
  try {
    const publicFeeds = feeds.filter((feed) => feed.enabled);
    const webTasks = webPlans.filter(({ source }) => source.enabled);
    const tasks = [
      ...publicFeeds.map((feed) => async () => {
        try {
          return { feed, result: await refreshOneSource(feed, settings, fetchImpl, at) };
        } catch (error: any) {
          const message = error?.message || "岗位源刷新失败";
          updateSourceFailure(feed, new Date().toISOString(), message);
          return { feed, error: message };
        }
      }),
      ...webTasks.map(({ plan, source }) => async () => {
        try {
          const webConfig = catalogWebSearchConfig();
          const collected = await collectWebSearchPlan(plan, {
            baseUrl: webConfig.baseUrl,
            model: webConfig.model,
            key: webConfig.key,
            requestTimeoutMs: webConfig.requestTimeoutMs,
            fetchImpl,
          });
          const checkedAt = at.toISOString();
          const stored = storeCatalogItems(collected.items, source, checkedAt, at, settings);
          updateSourceSuccess(source, checkedAt, new Response(null), collected.fetchedCount);
          return { feed: source, result: { fetchedCount: collected.fetchedCount, ...stored } };
        } catch (error: any) {
          const message = error?.message || "后台联网采集失败";
          updateSourceFailure(source, new Date().toISOString(), message);
          return { feed: source, error: message };
        }
      }),
    ];
    const results = await mapWithConcurrency(tasks, settings.fetchConcurrency, (task) => task());
    for (const item of results) {
      if ("error" in item) {
        errors.push(`${item.feed.name}: ${item.error}`.slice(0, 300));
        continue;
      }
      fetchedCount += item.result.fetchedCount;
      acceptedCount += item.result.acceptedCount;
      rejectedCount += item.result.rejectedCount;
    }
    const expiredCount = expireAndPrune(at, settings);
    const finishedAt = new Date().toISOString();
    const summary: RefreshSummary = {
      runId,
      status: errors.length === enabledFeeds.length ? "failed" : errors.length ? "partial" : "success",
      startedAt,
      finishedAt,
      sourceCount: enabledFeeds.length,
      fetchedCount,
      acceptedCount,
      rejectedCount,
      expiredCount,
      errors,
    };
    catalogRunRecord(summary);
    return summary;
  } finally {
    releaseLease(owner);
  }
}

function parseEvidence(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function getCatalogStatus(at = new Date()): CatalogStatus {
  const settings = catalogSettings();
  const sources = all<{ id: string; enabled: number }>("SELECT id,enabled FROM catalog_sources");
  const plannedWebSources = webSearchIsConfigured() ? webSearchPlansWithSources().map(({ source }) => source.id) : [];
  const persistedWebSources = new Set(sources.filter((source) => source.id.startsWith("catalog-web-")).map((source) => source.id));
  const pendingWebSourceCount = plannedWebSources.filter((id) => !persistedWebSources.has(id)).length;
  const activeJobCount = Number(one<{ count: number }>("SELECT COUNT(*) count FROM jobs WHERE catalogState='active'")?.count || 0);
  const freshJobCount = Number(one<{ count: number }>(
    "SELECT COUNT(*) count FROM jobs WHERE catalogState='active' AND lastSeenAt>=? AND (expiresAt IS NULL OR expiresAt>?)",
    freshnessCutoff(at, settings.staleAfterHours),
    at.toISOString(),
  )?.count || 0);
  const latest = one<any>("SELECT * FROM catalog_refresh_runs ORDER BY startedAt DESC LIMIT 1");
  const lastSuccess = one<{ finishedAt: string }>(
    "SELECT finishedAt FROM catalog_refresh_runs WHERE status='success' ORDER BY finishedAt DESC LIMIT 1",
  );
  const lastRefreshAt = latest?.finishedAt || latest?.startedAt || null;
  return {
    configured: sources.some((source) => !!source.enabled) || pendingWebSourceCount > 0,
    sourceCount: sources.length + pendingWebSourceCount,
    enabledSourceCount: sources.filter((source) => !!source.enabled).length + pendingWebSourceCount,
    activeJobCount,
    freshJobCount,
    lastRefreshAt,
    lastSuccessAt: lastSuccess?.finishedAt || null,
    lastStatus: latest?.status || null,
    lastError: latest?.errorSummary || null,
    nextRefreshAt: lastRefreshAt
      ? new Date(Date.parse(lastRefreshAt) + settings.refreshIntervalMinutes * 60 * 1000).toISOString()
      : null,
    refreshIntervalMinutes: settings.refreshIntervalMinutes,
    staleAfterHours: settings.staleAfterHours,
  };
}

function rowToCatalogJob(row: any): CatalogMatchJob {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    city: row.city,
    education: row.education || null,
    graduationYear: row.graduationYear || null,
    workMode: row.workMode || null,
    industry: row.industry || null,
    description: row.description,
    applicationEmail: row.applicationEmail || null,
    applicationType: row.applicationType === "verified_email" ? "verified_email" : "official_apply",
    applicationUrl: row.applicationUrl,
    jobFingerprint: row.jobFingerprint || buildJobFingerprint(row),
    publishedAt: row.publishedAt || null,
    expiresAt: row.expiresAt || null,
    firstSeenAt: row.firstSeenAt || null,
    lastSeenAt: row.lastSeenAt || null,
    sourceEvidence: parseEvidence(row.sourceEvidenceJson),
    source: {
      id: row.sourceId,
      name: row.sourceName,
      url: row.sourceUrl,
      sourceType: CATALOG_SOURCE_TYPE,
      verified: !!row.sourceVerified,
    },
  };
}

export function searchCatalogJobs(query: CatalogSearchQuery) {
  const at = new Date();
  const settings = catalogSettings();
  const excludedUrls = new Set((query.excludeUrls || []).map(cleanUrl));
  const excludedFingerprints = new Set(query.excludeFingerprints || []);
  const rows = all<any>(
    `SELECT j.*,s.name sourceName,s.url sourceUrl,s.sourceType,s.verified sourceVerified
     FROM jobs j JOIN sources s ON s.id=j.sourceId
       JOIN catalog_sources cs ON cs.id=j.catalogSourceKey AND cs.enabled=1
     WHERE j.catalogState='active' AND s.sourceType=?
       AND j.lastSeenAt>=? AND (j.expiresAt IS NULL OR j.expiresAt>?)
     ORDER BY j.lastSeenAt DESC LIMIT ?`,
    CATALOG_SOURCE_TYPE,
    freshnessCutoff(at, settings.staleAfterHours),
    at.toISOString(),
    settings.maxActiveJobs,
  );
  const jobs: CatalogMatchJob[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const job = rowToCatalogJob(row);
    if (query.city && !sameCity(job.city, query.city)) continue;
    if (excludedUrls.has(cleanUrl(job.source.url)) || excludedUrls.has(cleanUrl(job.applicationUrl))) continue;
    if (excludedFingerprints.has(job.jobFingerprint) || seen.has(job.jobFingerprint)) continue;
    seen.add(job.jobFingerprint);
    jobs.push(job);
  }
  const catalog = getCatalogStatus(at);
  let warning: string | undefined;
  if (!catalog.configured) warning = "岗位库尚未配置公开岗位数据源，后台刷新暂未启用。";
  else if (!catalog.freshJobCount) warning = "岗位库目前没有新鲜岗位，后台会按计划继续更新，请稍后再试。";
  else if (!jobs.length) warning = query.city
    ? `岗位库中暂时没有符合“${query.city}”的最新岗位，请稍后再试。`
    : "岗位库中暂时没有符合当前条件的最新岗位，请稍后再试。";
  else if (jobs.length < MATCH_RESULT_TARGET) warning = `岗位库当前只有 ${jobs.length} 个符合条件的最新岗位，未使用过期或虚构岗位补足。`;
  return {
    jobs: jobs.slice(0, MATCH_RESULT_STORAGE_LIMIT),
    mode: "catalog" as const,
    fetchedAt: at.toISOString(),
    warning,
    catalog,
  };
}
