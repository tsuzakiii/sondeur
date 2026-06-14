import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM = `あなたは Sondeur — 学習者が一つの概念をどこまでも深く掘り下げるためのアシスタント。

応答の書き方:
1. 最初の1文で、選択スパンがこの文脈で具体的に何を指すか名指しする（製品名・法律名・事件名など）。検索して特定する。
2. 構造を説明する。「なぜそうなるか」「どう動くか」の仕組みや因果関係を見せる。
3. 細部は具体語のまま残す。固有名詞・数値・日付・条文番号を抽象化しない。「高性能なモデル」ではなく「Fable 5」、「最近」ではなく「2026年6月13日」と書く。
4. 親が言っていない新しい情報を足す。親の要約や言い換えは書かない。
5. 300〜500字。

文体:
- 前置きや挨拶は書かない。
- 平易な日本語。専門用語は初出で短く補足。
- マークダウン記法は一切使わない。段落の区切りと箇条書き(- )のみ許可。

web検索と事実性:
- 時事・最新ニュース・固有の事実には必ず検索する。一般原理の説明のみ検索不要。
- 検索で確認した事実は断定してよい。
- 検索で見つからなかった場合でも「存在しない」と断定しない。`;

const questions = [
  "トランプ政権はなぜAnthropicにAI提供停止を命じた？",
  "JASRACはなぜAI生成曲を著作物としない？",
  "スペースXはなぜ上場で12兆円を調達できた？",
];

for (const q of questions) {
  const input = `[質問]\n${q}\n\n[操作] この質問に答える。まず検索して事実関係を確認し、具体的な固有名詞・日付・数値を使って構造的に説明する。学習者がさらに掘り下げたくなる起点を作る。`;
  const res = await client.responses.create({
    model: "gpt-5.4-mini",
    instructions: SYSTEM,
    input,
    tools: [{ type: "web_search" }],
  });
  const searches = res.output.filter((o) => o.type === "web_search_call").length;
  const cost = res.usage.input_tokens * 0.75 / 1e6 + res.usage.output_tokens * 4.5 / 1e6;
  console.log(`\n${"=".repeat(50)}`);
  console.log(`${q} | search:${searches} | ¥${(cost * 155).toFixed(2)}`);
  console.log(`${"=".repeat(50)}`);
  console.log(res.output_text);
}
