export const runtime = "nodejs";
// ISR: レスポンス自体を1日キャッシュする (サーバーレスでもLLM呼び出しは1日1回に抑えられる)
export const revalidate = 86400;

const FALLBACK = [
  "LE-9エンジンとSSMEの違いは？",
  "NISAの税制優遇はどういう仕組み？",
  "TransformerとMambaは何がどう違う？",
];

// NHKの公開RSS (無料・キー不要)。分野の異なる3カテゴリ
const NHK_FEEDS = [
  { url: "https://www.nhk.or.jp/rss/news/cat3.xml", label: "科学文化" },
  { url: "https://www.nhk.or.jp/rss/news/cat5.xml", label: "経済" },
  { url: "https://www.nhk.or.jp/rss/news/cat6.xml", label: "国際" },
];

function todayJst(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

/** RSSから<item><title>を抽出 (依存なしの簡易パース) */
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
        // no-store にするとルートが動的化してISRが効かなくなるので、fetchも日次キャッシュ
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

/** 見出し→概念質問への変換 (検索なし・低reasoning・1日1回だけ呼ばれる) */
async function headlinesToQuestions(
  feeds: { label: string; titles: string[] }[]
): Promise<string[]> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.SONDEUR_MODEL ?? "gpt-5.4-mini";
  const headlines = feeds
    .map((f) => `[${f.label}]\n${f.titles.map((t) => `- ${t}`).join("\n")}`)
    .join("\n\n");
  const res = await client.responses.create({
    model,
    instructions: "あなたは学習サービス Sondeur のサジェスト生成器。",
    input: `以下は本日のニュース見出し。ここから「調べて深く理解したくなる問い」を3つ作れ。

${headlines}

条件:
- ニュースそのものを問うのではなく、背景にある仕組み・技術・制度を問う (例: 「AIチップ輸出規制」→「半導体の輸出規制はどう機能する？」、「日銀利上げ」→「金利が上がると何が起こる？」)
- 予備知識がない人でも「面白そう」と思える平易な問い。専門用語を主語にしない
- それぞれ25字以内、日本語、疑問文、「？」で終わる
- 異なるカテゴリから1つずつ
- 出力はJSON配列のみ: ["質問1","質問2","質問3"]`,
    reasoning: { effort: "low" },
  });
  const parsed = parseSuggestions(res.output_text ?? "");
  if (!parsed) throw new Error("suggestion parse failed");
  return parsed;
}

export async function GET() {
  const date = todayJst();
  try {
    const feeds = await fetchHeadlines();
    if (feeds.length === 0) throw new Error("no headlines");
    if (!process.env.OPENAI_API_KEY) {
      // LLMなしでも見出しベースの素朴なサジェストは出せる
      const raw = feeds.flatMap((f) => f.titles.slice(0, 1)).slice(0, 3);
      return Response.json({ date, suggestions: raw.map((t) => `${t} とは？`), source: "rss-raw" });
    }
    const suggestions = await headlinesToQuestions(feeds);
    return Response.json({ date, suggestions, source: "rss+llm" });
  } catch (err) {
    console.error("[suggestions]", err);
    return Response.json({ date, suggestions: FALLBACK, source: "fallback" });
  }
}
