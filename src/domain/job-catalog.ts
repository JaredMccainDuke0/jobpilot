export const CATALOG_SOURCE_TYPE = "catalog_feed" as const;

export type CatalogFeedKind = "greenhouse" | "lever" | "json" | "rss";

export type CatalogFieldMap = Partial<Record<
  | "id"
  | "title"
  | "company"
  | "city"
  | "description"
  | "applicationUrl"
  | "sourceUrl"
  | "applicationEmail"
  | "education"
  | "graduationYear"
  | "workMode"
  | "industry"
  | "publishedAt"
  | "updatedAt"
  | "expiresAt",
  string
>>;

export type CatalogFeedConfig = {
  id: string;
  kind: CatalogFeedKind;
  name: string;
  url: string;
  enabled: boolean;
  official: boolean;
  company?: string;
  city?: string;
  itemsPath?: string;
  fields?: CatalogFieldMap;
};

export type CatalogWebSearchPlan = {
  id: string;
  city: string;
  roles: string[];
  name: string;
};

export type RawCatalogItem = Record<string, unknown> & {
  externalId?: string | null;
  title?: string | null;
  company?: string | null;
  city?: string | null;
  description?: string | null;
  applicationUrl?: string | null;
  sourceUrl?: string | null;
  applicationEmail?: string | null;
  education?: string | null;
  graduationYear?: number | string | null;
  workMode?: string | null;
  industry?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  expiresAt?: string | null;
  sourceName?: string | null;
  sourceVerified?: boolean;
  sourceEvidence?: Record<string, unknown> | null;
};

export type NormalizedCatalogJob = {
  externalId: string;
  title: string;
  company: string;
  city: string;
  education: string | null;
  graduationYear: number | null;
  workMode: string | null;
  industry: string | null;
  description: string;
  applicationEmail: string | null;
  applicationUrl: string;
  sourceUrl: string;
  sourceName: string;
  sourceVerified?: boolean;
  sourceEvidence?: Record<string, unknown> | null;
  publishedAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
};

export type CatalogSettings = {
  refreshIntervalMinutes: number;
  staleAfterHours: number;
  maxAgeDays: number;
  maxActiveJobs: number;
  retentionDays: number;
  fetchConcurrency: number;
  requestTimeoutMs: number;
  maxFeedBytes: number;
};

const positiveInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export function catalogSettings(env: Record<string, string | undefined> = process.env): CatalogSettings {
  return {
    refreshIntervalMinutes: positiveInt(env.JOBPILOT_CATALOG_REFRESH_MINUTES, 60, 5, 24 * 60),
    staleAfterHours: positiveInt(env.JOBPILOT_CATALOG_STALE_HOURS, 48, 1, 24 * 30),
    maxAgeDays: positiveInt(env.JOBPILOT_CATALOG_MAX_AGE_DAYS, 45, 1, 365),
    maxActiveJobs: positiveInt(env.JOBPILOT_CATALOG_MAX_ACTIVE_JOBS, 5000, 10, 100000),
    retentionDays: positiveInt(env.JOBPILOT_CATALOG_RETENTION_DAYS, 90, 1, 3650),
    fetchConcurrency: positiveInt(env.JOBPILOT_CATALOG_FETCH_CONCURRENCY, 3, 1, 10),
    requestTimeoutMs: positiveInt(env.JOBPILOT_CATALOG_REQUEST_TIMEOUT_MS, 15000, 1000, 120000),
    maxFeedBytes: positiveInt(env.JOBPILOT_CATALOG_MAX_FEED_BYTES, 4 * 1024 * 1024, 64 * 1024, 32 * 1024 * 1024),
  };
}

export function freshnessCutoff(at: Date, staleAfterHours: number) {
  return new Date(at.getTime() - staleAfterHours * 60 * 60 * 1000).toISOString();
}

export function ageCutoff(at: Date, maxAgeDays: number) {
  return new Date(at.getTime() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
}

export function isCurrentCatalogItem(
  item: Pick<NormalizedCatalogJob, "publishedAt" | "updatedAt" | "expiresAt">,
  at: Date,
  maxAgeDays: number,
) {
  const current = at.getTime();
  if (item.expiresAt) {
    const expires = Date.parse(item.expiresAt);
    if (!Number.isFinite(expires) || expires <= current) return false;
  }
  const latest = [item.publishedAt, item.updatedAt]
    .filter((value): value is string => !!value)
    .map(Date.parse)
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  return latest === undefined || latest >= Date.parse(ageCutoff(at, maxAgeDays));
}

export function normalizeCatalogDate(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function normalizeCatalogEmail(value: unknown) {
  const candidate = String(value || "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate) ? candidate : null;
}

export function inferWorkMode(value: unknown, description = "") {
  const text = `${String(value || "")} ${description}`.toLowerCase();
  if (/远程|remote|work from home|wfh/.test(text)) return "远程";
  if (/混合|hybrid/.test(text)) return "混合";
  if (/现场|on[- ]?site|office/.test(text)) return "现场";
  return String(value || "").trim() || null;
}

const splitList = (value: unknown, fallback: string[], max: number) => {
  const values = String(value || "")
    .split(/[,，;；|\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
  return values.length ? values : fallback;
};

export function catalogWebSearchConfig(env: Record<string, string | undefined> = process.env) {
  const baseUrl = String(env.JOBPILOT_MODEL_BASE_URL || "").trim().replace(/\/$/, "");
  const model = String(env.JOBPILOT_MODEL_NAME || "").trim();
  const key = String(env.JOBPILOT_MODEL_API_KEY || "").trim();
  return {
    enabled: env.JOBPILOT_CATALOG_WEB_SEARCH !== "0" && !!baseUrl && !!model && !!key,
    baseUrl,
    model,
    key,
    cities: splitList(env.JOBPILOT_CATALOG_CITIES, ["东莞", "广州", "深圳"], 20),
    roles: splitList(env.JOBPILOT_CATALOG_ROLE_FAMILIES, [
      "人工智能",
      "大模型",
      "机器学习",
      "算法",
      "通信",
      "后端",
      "数据工程",
      "平台工程",
    ], 40),
    maxQueries: positiveInt(env.JOBPILOT_CATALOG_WEB_SEARCH_MAX_QUERIES, 6, 1, 30),
    requestTimeoutMs: positiveInt(env.JOBPILOT_CATALOG_WEB_SEARCH_TIMEOUT_MS, 90000, 10000, 120000),
  };
}

export function catalogWebSearchPlans(
  config = catalogWebSearchConfig(),
): CatalogWebSearchPlan[] {
  const roleGroups: string[][] = [];
  for (let index = 0; index < config.roles.length; index += 3) roleGroups.push(config.roles.slice(index, index + 3));
  return config.cities
    .flatMap((city) => roleGroups.map((roles, groupIndex) => ({
      id: `web-${city}-${groupIndex + 1}`.replace(/[^\p{L}\p{N}-]+/gu, "-").toLowerCase(),
      city,
      roles,
      name: `后台联网采集 · ${city} · ${roles.join("、")}`,
    })))
    .slice(0, config.maxQueries);
}
