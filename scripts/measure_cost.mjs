// 1ノード生成の実コストを測定する (実プロンプト相当で usage を取得)
// 実行: node --env-file=.env.local scripts/measure_cost.mjs
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.SONDEUR_MODEL ?? "gpt-5.4-mini";

// 実アプリと同等の文脈量 (親+祖父本文 ≈ 600字)
const parentContent =
  "LE-9でエキスパンダーブリードサイクルを採る理由は、機構を単純化しやすく、信頼性や保守性を優先しやすいからです。" +
  "LE-7のような二段燃焼サイクルと比べ、プリバーナーが不要で部品数も削減できます。液体水素は冷たく、燃焼室やノズルで吸収した熱で簡単に気化・膨張するので、ターボポンプを回す動力を比較的きれいに取り出せます。";
const grandparentContent =
  "ロケットエンジンの燃焼サイクルには、ガス発生器サイクル、二段燃焼サイクル、エキスパンダーサイクルなどがあり、それぞれタービン駆動ガスの作り方が異なります。日本のH3ロケットの第一段エンジンLE-9は、大型エンジンとして世界で初めてエキスパンダーブリードサイクルを採用しました。";

const SYSTEM = `あなたは Sondeur — 学習者が概念を掘り下げるためのアシスタント。簡潔に300〜500字程度。選択された概念と元の文脈との関係まで踏み込む。`;

const cases = [
  { label: "検索なし想定 (一般概念)", span: "プリバーナー" },
  { label: "検索あり想定 (固有事実)", span: "LE-7の部品数削減はどの程度か。最新の公表情報を確認して答えて" },
];

const PRICE_IN = 0.75 / 1e6; // $/token
const PRICE_OUT = 4.5 / 1e6;
const JPY = 155;

for (const c of cases) {
  const res = await client.responses.create({
    model,
    instructions: SYSTEM,
    input: `[ツリー概要]\n1. Q: LE-9エンジンがエキスパンダーブリードサイクルを採用できた理由は？\n\n[祖父ノード本文]\n${grandparentContent}\n\n[親ノード本文]\n${parentContent}\n\n[選択スパン] "${c.span}"\n\n[操作] What is it — 選択スパンが何であるかを、親本文の文脈に即して説明する`,
    reasoning: { effort: "low" },
    tools: [{ type: "web_search" }],
  });
  const u = res.usage;
  const searches = res.output.filter((o) => o.type === "web_search_call").length;
  const cost = u.input_tokens * PRICE_IN + u.output_tokens * PRICE_OUT;
  console.log(`--- ${c.label} ---`);
  console.log(`input: ${u.input_tokens} (cached: ${u.input_tokens_details?.cached_tokens ?? 0})  output: ${u.output_tokens} (reasoning: ${u.output_tokens_details?.reasoning_tokens ?? 0})`);
  console.log(`web_search回数: ${searches}`);
  console.log(`トークン費用: $${cost.toFixed(5)} ≈ ¥${(cost * JPY).toFixed(2)} (検索ツール料別)`);
}
