// 1ノード生成の実コストを測定する (gpt-5.4-mini vs gpt-5.4)
// 実行: node --env-file=.env.local scripts/measure_cost.mjs
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const USD_TO_JPY = 155;
const WEB_SEARCH_CALL_USD = 10 / 1000;

const PRICES = {
  "gpt-5.4-mini": { in: 0.375 / 1e6, cachedIn: 0.0375 / 1e6, out: 2.25 / 1e6 },
  "gpt-5.4": { in: 1.25 / 1e6, cachedIn: 0.125 / 1e6, out: 7.5 / 1e6 },
};

function estimateCost(usage, searches, price) {
  const cachedInput = usage.input_tokens_details?.cached_tokens ?? 0;
  const uncachedInput = Math.max(0, usage.input_tokens - cachedInput);
  const tokenCost =
    uncachedInput * price.in +
    cachedInput * price.cachedIn +
    usage.output_tokens * price.out;
  const searchCost = searches * WEB_SEARCH_CALL_USD;
  return { tokenCost, searchCost, total: tokenCost + searchCost };
}

const SYSTEM = `あなたは Sondeur — 学習者が一つの概念をどこまでも深く掘り下げるためのアシスタント。

核心原則:
- 親の文脈でその言葉が具体的に何を指すかを特定してから掘り下げる
- 親が触れなかった仕組み・背景・具体例・数値・比較を足す

応答ルール:
- 300〜500字。前置きや挨拶は書かない。
- 具体的に書く。固有名詞・数値・実例を使い、辞書的な一般論で終わらない。
- マークダウン記法は一切使わない。段落の区切りと箇条書き(- )のみ許可。
- web検索: 時事・最新ニュース・固有の事実には必ず検索する。`;

const parentContent =
  "報道では、政府が外国籍の利用者への最先端モデルへのアクセスを止めるよう求め、アンソロピックはそれに従って一部モデルを停止しました。";

const cases = [
  { label: "What is it (検索あり想定)", span: "最先端モデル",
    op: "What is it — 親本文の文脈で「最先端モデル」が何を指すか特定し、それが何であるかを具体的に掘り下げる。" },
  { label: "Why is it", span: "アクセスを止めるよう求め",
    op: "Why is it — 親本文の文脈で、なぜ「アクセスを止めるよう求め」なのかを具体的に掘り下げる。" },
];

for (const model of ["gpt-5.4-mini", "gpt-5.4"]) {
  const p = PRICES[model];
  console.log(`\n========== ${model} ==========`);
  for (const c of cases) {
    const res = await client.responses.create({
      model,
      instructions: SYSTEM,
      input: `[親ノード本文]\n${parentContent}\n\n[選択スパン] "${c.span}"\n\n[操作] ${c.op}`,
      tools: [{ type: "web_search" }],
    });
    const u = res.usage;
    const searches = res.output.filter((o) => o.type === "web_search_call").length;
    const cost = estimateCost(u, searches, p);
    console.log(`--- ${c.label} ---`);
    console.log(`input: ${u.input_tokens} (cached: ${u.input_tokens_details?.cached_tokens ?? 0})  output: ${u.output_tokens} (reasoning: ${u.output_tokens_details?.reasoning_tokens ?? 0})`);
    console.log(`web_search: ${searches}回`);
    console.log(`token cost: $${cost.tokenCost.toFixed(5)}  search cost: $${cost.searchCost.toFixed(5)}`);
    console.log(`total: $${cost.total.toFixed(5)} = ¥${(cost.total * USD_TO_JPY).toFixed(2)}`);
    console.log(`応答冒頭: ${res.output_text?.slice(0, 80)}...`);
  }
}
