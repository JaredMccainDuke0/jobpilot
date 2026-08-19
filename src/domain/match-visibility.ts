// Five is the minimum target. Keep a bounded upper limit so one refresh cannot
// create an unbounded result set or selection payload.
export const MATCH_RESULT_TARGET = 5;
export const MATCH_RESULT_LIMIT = 10;

export function normalizeVisibleResultIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, MATCH_RESULT_LIMIT);
}
