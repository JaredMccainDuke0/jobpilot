import { MATCH_PAGE_SIZE } from "./match-visibility";

export type EligibilityFilter = "all" | "eligible" | "ineligible";
export type ApplicationFilter = "all" | "automatic" | "manual";

export type MatchFilters = {
  q: string;
  city: string;
  workMode: string;
  industry: string;
  eligibility: EligibilityFilter;
  application: ApplicationFilter;
};

export const EMPTY_MATCH_FILTERS: MatchFilters = {
  q: "",
  city: "",
  workMode: "",
  industry: "",
  eligibility: "all",
  application: "all",
};

const clean = (value: string | null, max: number) => String(value || "").trim().slice(0, max);
const normalize = (value: unknown) => String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export function parseMatchView(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const eligibility = params.get("eligibility");
  const application = params.get("application");
  const requestedPage = Number.parseInt(params.get("page") || "1", 10);
  return {
    filters: {
      q: clean(params.get("q"), 80),
      city: clean(params.get("city"), 40),
      workMode: clean(params.get("workMode"), 20),
      industry: clean(params.get("industry"), 40),
      eligibility: eligibility === "eligible" || eligibility === "ineligible" ? eligibility : "all",
      application: application === "automatic" || application === "manual" ? application : "all",
    } satisfies MatchFilters,
    page: Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}

export function buildMatchesHref(filters: MatchFilters, page = 1) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.city) params.set("city", filters.city);
  if (filters.workMode) params.set("workMode", filters.workMode);
  if (filters.industry) params.set("industry", filters.industry);
  if (filters.eligibility !== "all") params.set("eligibility", filters.eligibility);
  if (filters.application !== "all") params.set("application", filters.application);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/matches?${query}` : "/matches";
}

export function activeMatchFilterCount(filters: MatchFilters) {
  return [filters.q, filters.city, filters.workMode, filters.industry].filter(Boolean).length
    + Number(filters.eligibility !== "all")
    + Number(filters.application !== "all");
}

export function filterMatchResults<T extends {
  eligible: boolean;
  job: {
    title?: string;
    company?: string;
    city?: string;
    workMode?: string | null;
    industry?: string | null;
    description?: string | null;
    applicationType?: string;
    source?: { verified?: boolean; sourceType?: string };
  };
}>(results: T[], filters: MatchFilters) {
  const keyword = normalize(filters.q);
  const city = normalize(filters.city);
  const workMode = normalize(filters.workMode);
  const industry = normalize(filters.industry);
  return results.filter((result) => {
    const job = result.job;
    const haystack = normalize([job.title, job.company, job.description, job.industry].filter(Boolean).join(" "));
    if (keyword && !haystack.includes(keyword)) return false;
    if (city && !normalize(job.city).includes(city)) return false;
    if (workMode && normalize(job.workMode) !== workMode) return false;
    if (industry && !normalize(job.industry).includes(industry)) return false;
    if (filters.eligibility === "eligible" && !result.eligible) return false;
    if (filters.eligibility === "ineligible" && result.eligible) return false;
    const isAutomatic = job.applicationType === "verified_email" && !!job.source?.verified;
    if (filters.application === "automatic" && !isAutomatic) return false;
    if (filters.application === "manual" && isAutomatic) return false;
    return true;
  });
}

export function paginateMatchResults<T>(results: T[], requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(results.length / MATCH_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * MATCH_PAGE_SIZE;
  return {
    page,
    totalPages,
    start,
    end: Math.min(start + MATCH_PAGE_SIZE, results.length),
    items: results.slice(start, start + MATCH_PAGE_SIZE),
  };
}
