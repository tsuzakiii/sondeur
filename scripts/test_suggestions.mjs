import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const res = await client.responses.create({
  model: process.env.SONDEUR_MODEL ?? "gpt-5.4-mini",
  instructions:
    "あなたは学習サービス Sondeur のサジェスト生成器。検索で本日の実際のニュースを確認してから出力する。",
  input: `本日 (2026-06-13) の科学・技術・経済・国際の注目ニュースをweb検索で調べ、そこから「概念の掘り下げ学習の起点」に向く短い質問を3つ作れ。

条件:
- ニュースの感想ではなく、背後にある仕組み・概念を問う形にする
- それぞれ30字以内、日本語、疑問文
- 異なる分野から1つずつ
- 出力はJSON配列のみ: ["質問1","質問2","質問3"]`,
  reasoning: { effort: "low" },
  tools: [{ type: "web_search" }],
});
console.log("=== output_text ===");
console.log(JSON.stringify(res.output_text));
console.log("=== output items ===");
for (const item of res.output) {
  console.log(item.type, JSON.stringify(item).slice(0, 200));
}
