/** Stable IDs shared by settings, account metadata, and the suggestions API. */
export const INTERESTS = [
  { id: "science", en: "Science", ja: "科学" },
  { id: "technology", en: "Technology & AI", ja: "テクノロジー・AI" },
  { id: "space", en: "Space", ja: "宇宙" },
  { id: "economics", en: "Economics & finance", ja: "経済・金融" },
  { id: "business", en: "Business", ja: "ビジネス" },
  { id: "world", en: "World & politics", ja: "国際情勢・政治" },
  { id: "history", en: "History", ja: "歴史" },
  { id: "culture", en: "Arts & culture", ja: "芸術・文化" },
  { id: "health", en: "Health & medicine", ja: "健康・医療" },
  { id: "environment", en: "Environment", ja: "環境" },
] as const;
export type InterestId = typeof INTERESTS[number]["id"];
export const MAX_INTERESTS = 3;
export const INTERESTS_METADATA_KEY = "sondeur_interests";

export function normalizeInterests(value: unknown): InterestId[] {
  if (!Array.isArray(value)) return [];
  return INTERESTS.filter(topic => value.includes(topic.id)).slice(0, MAX_INTERESTS).map(topic => topic.id);
}

export function interestLabels(ids: InterestId[], lang: "en" | "ja") {
  return ids.map(id => INTERESTS.find(topic => topic.id === id)![lang]);
}

/** A cache entry must match both the language and the saved topic selection. */
export function suggestionsCacheKey(lang: string, interests: InterestId[]) {
  return `sondeur.suggestions.v3.${lang}.${normalizeInterests(interests).join(",") || "all"}`;
}

export function topicFallback(interests: InterestId[], lang: "en" | "ja"): string[] {
  const labels = interestLabels(interests, lang);
  return Array.from({ length: 3 }, (_, i) => {
    const topic = labels[i % labels.length];
    return lang === "ja"
      ? [
        `${topic}を理解するための基本的な仕組みは？`,
        `${topic}の歴史を変えた転換点は？`,
        `${topic}にはどんな未解決の課題がある？`,
      ][i]
      : [
        `What are the key mechanisms behind ${topic}?`,
        `Which turning points shaped ${topic}?`,
        `What are the biggest unsolved questions in ${topic}?`,
      ][i];
  });
}
