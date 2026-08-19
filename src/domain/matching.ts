export type Candidate = { city?: string; education?: string; graduationYear?: number; skills?: string[] };
export type Preference = { rawText: string; city?: string | null; workMode?: string | null; jobType?: string | null; industry?: string | null };
export type MatchableJob = { title: string; city: string; education?: string | null; graduationYear?: number | null; workMode?: string | null; industry?: string | null; description: string };

// City is a hard constraint. Normalize administrative suffixes and separators so that
// "深圳市" / "深圳" / "深圳/广州" compare correctly without weakening the constraint into
// unrelated-city false positives.
export function normalizeCity(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, "").replace(/(省|市|区|县)$/g, "");
}
export function sameCity(a?: string | null, b?: string | null) {
  const x = normalizeCity(a), y = normalizeCity(b);
  if (!x || !y) return true; // no required city, or job city unknown -> do not reject here
  return x === y || x.includes(y) || y.includes(x);
}

const capabilityGroups = [
  ["大模型", "llm", "生成式ai", "generative ai", "人工智能", "ai"],
  ["智能体", "agent", "rag", "检索增强"],
  ["机器学习", "machine learning", "深度学习", "deep learning"],
  ["自然语言处理", "nlp", "文本", "语言模型"],
  ["算法", "algorithm", "推荐", "搜索"],
  ["python", "pytorch", "tensorflow"],
  ["通信", "无线", "信号处理", "communication"],
  ["后端", "backend", "平台", "工程化", "部署"],
];

export function matchJob(candidate: Candidate, preference: Preference, job: MatchableJob) {
  const mismatch: string[] = [], reasons: string[] = [], unknown: string[] = [], risks: string[] = [];
  const wantedCity = preference.city || candidate.city;
  if (wantedCity && !sameCity(job.city, wantedCity)) mismatch.push(`城市不符：需要 ${wantedCity}，职位在 ${job.city}`);
  else reasons.push(`城市匹配：${job.city}`);
  if (job.graduationYear && candidate.graduationYear && job.graduationYear !== candidate.graduationYear) mismatch.push(`毕业年份要求 ${job.graduationYear}`);
  if (!job.graduationYear) unknown.push("职位未说明毕业年份");
  if (preference.workMode && job.workMode && preference.workMode !== job.workMode) mismatch.push(`工作方式不符：${job.workMode}`);

  const terms = [...(candidate.skills || []), preference.rawText, preference.jobType || "", preference.industry || ""].join(" ").toLowerCase();
  const haystack = `${job.title} ${job.description} ${job.industry || ""}`.toLowerCase();
  const matched = capabilityGroups.filter((group) => group.some((term) => terms.includes(term)) && group.some((term) => haystack.includes(term))).map((group) => group.find((term) => haystack.includes(term))!);
  reasons.push(...matched.slice(0, 3).map((term) => `能力或方向接近：${term}`));
  if (!matched.length) unknown.push("未发现明确的能力交集，可查看岗位详情后决定");

  const eligible = mismatch.length === 0;
  const score = eligible ? Math.min(96, 62 + reasons.length * 7) : Math.max(20, 55 - mismatch.length * 15);
  if (job.description.includes("忽略") || job.description.toLowerCase().includes("system prompt")) risks.push("岗位文本包含疑似指令，已作为不可信内容忽略");
  return { eligible, score, reasons, mismatch, unknown, risks };
}
