import { describe, expect, it } from "vitest";
import { EMPTY_MATCH_FILTERS, activeMatchFilterCount, buildMatchesHref, filterMatchResults, paginateMatchResults, parseMatchView } from "./match-filters";

const results = Array.from({ length: 23 }, (_, index) => ({
  id: `result-${index + 1}`,
  eligible: index % 2 === 0,
  job: {
    title: index === 0 ? "AI 应用工程师" : `岗位 ${index + 1}`,
    company: index === 0 ? "湾区智联" : "示例公司",
    city: index < 12 ? "深圳" : "广州",
    workMode: index % 3 === 0 ? "现场" : "混合",
    industry: index === 0 ? "人工智能" : "通信",
    description: index === 0 ? "Python 大模型应用" : "通信系统开发",
    applicationType: index === 0 ? "verified_email" : "official_apply",
    source: { verified: index === 0, sourceType: "model_web_search" },
  },
}));

describe("match result filters", () => {
  it("round-trips filters through the matches URL", () => {
    const href = buildMatchesHref({ ...EMPTY_MATCH_FILTERS, q: "AI", city: "深圳", eligibility: "eligible" }, 2);
    expect(href).toContain("page=2");
    const parsed = parseMatchView(href.split("?")[1]);
    expect(parsed).toMatchObject({ page: 2, filters: { q: "AI", city: "深圳", eligibility: "eligible" } });
    expect(activeMatchFilterCount(parsed.filters)).toBe(3);
  });

  it("filters already-loaded jobs without changing their order", () => {
    const filtered = filterMatchResults(results, { ...EMPTY_MATCH_FILTERS, q: "大模型", city: "深圳", application: "automatic" });
    expect(filtered.map((item) => item.id)).toEqual(["result-1"]);
  });

  it("paginates 23 results as 10, 10 and 3 and clamps invalid pages", () => {
    expect(paginateMatchResults(results, 1).items).toHaveLength(10);
    expect(paginateMatchResults(results, 2).items).toHaveLength(10);
    expect(paginateMatchResults(results, 99)).toMatchObject({ page: 3, totalPages: 3, start: 20, end: 23 });
  });
});
