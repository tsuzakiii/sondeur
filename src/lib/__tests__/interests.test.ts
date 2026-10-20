import { expect, it } from "vitest";
import { normalizeInterests, suggestionsCacheKey, topicFallback } from "../interests";

it("accepts only supported preferences with a stable order and a three-topic limit", () => {
  expect(normalizeInterests(["space", "science", "space", "bad", "history", "culture"])).toEqual(["science", "space", "history"]);
  expect(normalizeInterests({ interests: "space" })).toEqual([]);
});
it("invalidates the old recommendation cache after changing topics or language", () => {
  expect(suggestionsCacheKey("en", ["science", "space"])).toBe(suggestionsCacheKey("en", ["space", "science"]));
  expect(suggestionsCacheKey("en", ["science"])).not.toBe(suggestionsCacheKey("en", ["space"]));
  expect(suggestionsCacheKey("ja", ["science"])).not.toBe(suggestionsCacheKey("en", ["science"]));
  expect(suggestionsCacheKey("en", [])).toContain(".all");
});
it("provides three distinct relevant fallback questions even for one topic", () => {
  const questions = topicFallback(["history"], "ja");
  expect(new Set(questions).size).toBe(3);
  expect(questions.every(question => question.includes("歴史"))).toBe(true);
});
