export const runtime = "nodejs";
export const revalidate = 86400;

const FALLBACK_EN = [
  "How does the LE-9 engine differ from the SSME?",
  "How does NISA's tax advantage work?",
  "What's the difference between Transformer and Mamba?",
];

const FALLBACK_JA = [
  "LE-9エンジンとSSMEの違いは？",
  "NISAの税制優遇はどういう仕組み？",
  "TransformerとMambaは何がどう違う？",
];

const NHK_FEEDS = [
  { url: "https://www.nhk.or.jp/rss/news/cat3.xml", label: "Science/Culture" },
  { url: "https://www.nhk.or.jp/rss/news/cat5.xml", label: "Economy" },
  { url: "https://www.nhk.or.jp/rss/news/cat6.xml", label: "International" },
];

function todayJst(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function parseTitles(xml: string, limit: number): string[] {
  const titles: string[] = [];
  const items = xml.split("<item>").slice(1);
  for (const item of items) {
    const m = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    if (m?.[1]) titles.push(m[1].trim());
    if (titles.length >= limit) break;
  }
  return titles;
}

async function fetchHeadlines(): Promise<{ label: string; titles: string[] }[]> {
  const results = await Promise.allSettled(
    NHK_FEEDS.map(async (feed) => {
      const res = await fetch(feed.url, {
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 86400 },
      });
      if (!res.ok) throw new Error(`${feed.url} -> ${res.status}`);
      return { label: feed.label, titles: parseTitles(await res.text(), 5) };
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<{ label: string; titles: string[] }> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((f) => f.titles.length > 0);
}

function parseSuggestions(text: string): string[] | null {
  const m = text.match(/\[[\s\S]*?\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr)) return null;
    const items = arr.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
    return items.length >= 2 ? items.slice(0, 3) : null;
  } catch {
    return null;
  }
}

async function headlinesToQuestions(
  feeds: { label: string; titles: string[] }[],
  lang: string
): Promise<string[]> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.SONDEUR_MODEL ?? "gpt-5.4-mini";
  const headlines = feeds
    .map((f) => `[${f.label}]\n${f.titles.map((t) => `- ${t}`).join("\n")}`)
    .join("\n\n");

  const ja = lang === "ja";
  const instruction = ja
    ? "あなたは学習サービス Sondeur のサジェスト生成器。"
    : "You are the suggestion generator for Sondeur, a learning service.";

  const prompt = ja
    ? `以下は本日のニュース見出し。ここから「深掘りしたくなる問い」を3つ作れ。

${headlines}

条件:
- ニュースの具体的な出来事を残したまま「なぜ？」「どうやって？」を問う形にする
  良い例: 「米政府はなぜFable 5の国外アクセス禁止を要請した？」「トヨタが全固体電池を量産できる理由は？」
  悪い例: 「政府はAIをなぜ止められる？」「電池技術はどう進化する？」（抽象化しすぎ。具体的な固有名詞・事件を残す）
- 固有名詞（企業名・製品名・人名・国名）を入れて、今日の出来事だとわかるようにする
- それぞれ35字以内、日本語、疑問文、「？」で終わる
- 異なるカテゴリから1つずつ
- 出力はJSON配列のみ: ["質問1","質問2","質問3"]`
    : `Below are today's news headlines. Generate 3 questions that invite deeper exploration.

${headlines}

Requirements:
- Keep specific events from the headlines while framing them as "why?" or "how?" questions
  Good: "Why did the US government request blocking overseas access to Fable 5?" "How can Toyota mass-produce solid-state batteries?"
  Bad: "Why can governments stop AI?" "How does battery tech evolve?" (too abstract — keep specific proper nouns and events)
- Include proper nouns (company names, product names, people, countries) so the question is clearly about today's news
- Each question under 80 characters, in English, ending with "?"
- One from each category
- Output JSON array only: ["question1","question2","question3"]`;

  const res = await client.responses.create({
    model,
    instructions: instruction,
    input: prompt,
    reasoning: { effort: "low" },
  });
  const parsed = parseSuggestions(res.output_text ?? "");
  if (!parsed) throw new Error("suggestion parse failed");
  return parsed;
}

const cache = new Map<string, { date: string; suggestions: string[]; source: string }>();

export async function GET(request: Request) {
  const date = todayJst();
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") === "ja" ? "ja" : "en";
  const fallback = lang === "ja" ? FALLBACK_JA : FALLBACK_EN;
  const cacheKey = `${date}:${lang}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    return Response.json(cached);
  }

  if (!process.env.OPENAI_API_KEY) {
    // NHK見出しの原文露出を避けるため、キー未設定時は静的フォールバックを返す (キャッシュしない)
    return Response.json({ date, suggestions: fallback, source: "fallback" });
  }

  try {
    const feeds = await fetchHeadlines();
    if (feeds.length === 0) throw new Error("no headlines");
    const suggestions = await headlinesToQuestions(feeds, lang);
    const result = { date, suggestions, source: "rss+llm" };
    cache.set(cacheKey, result);
    return Response.json(result);
  } catch (err) {
    console.error("[suggestions]", err);
    return Response.json({ date, suggestions: fallback, source: "fallback" });
  }
}
