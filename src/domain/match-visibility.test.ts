import { describe, expect, it } from "vitest";
import { MATCH_PAGE_SIZE, MATCH_RESULT_STORAGE_LIMIT, MATCH_RESULT_TARGET, MATCH_SELECTION_LIMIT, normalizeVisibleResultIds } from "./match-visibility";

describe("visible match scope", () => {
  it("deduplicates and caps explicit result ids at the UI limit", () => {
    expect(
      normalizeVisibleResultIds([" a ", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "a"]),
    ).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
    expect(MATCH_RESULT_TARGET).toBe(5);
    expect(MATCH_PAGE_SIZE).toBe(10);
    expect(MATCH_RESULT_STORAGE_LIMIT).toBe(30);
    expect(MATCH_SELECTION_LIMIT).toBe(30);
  });

  it("rejects non-array visible scopes", () => {
    expect(normalizeVisibleResultIds("a")).toEqual([]);
  });
});
