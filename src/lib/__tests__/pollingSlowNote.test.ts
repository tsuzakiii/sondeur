import { describe, expect, it } from "vitest";
import { shouldShowSlowNote } from "@/lib/pollingSlowNote";

describe("shouldShowSlowNote (AC-M4-3)", () => {
  it("(a) attempt 0-9 with plan free → false", () => {
    for (let i = 0; i < 10; i += 1) {
      expect(shouldShowSlowNote(i, "free")).toBe(false);
    }
  });

  it("(b) attempt 10+ with plan free → true", () => {
    expect(shouldShowSlowNote(10, "free")).toBe(true);
    expect(shouldShowSlowNote(20, "free")).toBe(true);
    expect(shouldShowSlowNote(29, "free")).toBe(true);
  });

  it("(c) attempt 10+ with plan pro → false (polling succeeded early, note must not appear)", () => {
    expect(shouldShowSlowNote(10, "pro")).toBe(false);
    expect(shouldShowSlowNote(29, "pro")).toBe(false);
  });

  it("also returns false when plan is null (no profile yet fetched)", () => {
    expect(shouldShowSlowNote(15, null)).toBe(false);
    expect(shouldShowSlowNote(15, undefined)).toBe(false);
  });
});
