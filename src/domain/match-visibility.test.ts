import { describe, expect, it } from "vitest";
import { MATCH_RESULT_LIMIT, MATCH_RESULT_TARGET, normalizeVisibleResultIds } from "./match-visibility";

describe("visible match scope", () => {
  it("deduplicates and caps explicit result ids at the UI limit", () => {
    expect(
      normalizeVisibleResultIds([" a ", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "a"]),
    ).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
    expect(MATCH_RESULT_TARGET).toBe(5);
    expect(MATCH_RESULT_LIMIT).toBe(10);
  });

  it("rejects non-array visible scopes", () => {
    expect(normalizeVisibleResultIds("a")).toEqual([]);
  });
});
