// Keep enough catalog matches for local pagination while bounding each user's
// match snapshot.
export const MATCH_RESULT_TARGET = 5;
export const MATCH_RESULT_STORAGE_LIMIT = 30;
export const MATCH_PAGE_SIZE = 10;
export const MATCH_SELECTION_LIMIT = 30;

export function normalizeVisibleResultIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, MATCH_PAGE_SIZE);
}
