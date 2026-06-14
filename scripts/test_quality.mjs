import OpenAI from "openai";
import { readFileSync } from "node:fs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// route.ts から現在のシステムプロンプトを手動コピーではなく、直接定義
const SYSTEM = `あなたは Sondeur — 学習者が一つの概念をどこまでも深く掘り下げるためのアシスタント。

応答の書き方:
1. 最初の1文で、選択スパンがこの文脈で具体的に何を指すか名指しする（製品名・法律名・事件名など）。検索して特定すること。「〜を指します」のような一般的言い換えで逃げない。
2. 続けて、その具体的な対象について親が触れなかった仕組み・背景・数値・比較を300〜500字で説明する。
3. 親の要約や言い換えは書かない。親が言っていない情報だけ足す。

文体:
- 前置きや挨拶は書かない。
- 平易な日本語。専門用語は初出で短く補足。
- マークダウン記法は一切使わない。見出し(#)、太字(**)、リンク記法、コードブロックすべて禁止。段落の区切りと箇条書き(- )のみ許可。

web検索と事実性:
- 時事・最新ニュース・固有の事実には必ず検索する。一般原理の説明のみ検索不要。
- 検索で確認した事実は断定してよい。
- 検索で見つからなかった場合でも「存在しない」と断定しない。「確認できなかった」と述べ、見つかった関連情報をもとに可能な限り答える。`;

const cases = [
  {
    name: "Fable5 What is it",
    parent: "報道では、政府が外国籍の利用者への最先端モデルへのアクセスを止めるよう求め、アンソロピックはそれに従って一部モデルを停止しました。",
    span: "最先端モデル",
    op: "what",
  },
  {
    name: "Fable5 Why (アクセス停止)",
    parent: "報道では、政府が外国籍の利用者への最先端モデルへのアクセスを止めるよう求め、アンソロピックはそれに従って一部モデルを停止しました。",
    span: "アクセスを止めるよう求め",
    op: "why",
  },
  {
    name: "JASRAC What is it",
    parent: "JASRACは、AI生成楽曲には著作権が発生しないという見解を示しました。人間の創作的関与がなければ著作物にはあたらないとしています。",
    span: "著作権が発生しない",
    op: "what",
  },
  {
    name: "自由質問 (深い質問)",
    parent: "報道では、政府が外国籍の利用者への最先端モデルへのアクセスを止めるよう求め、アンソロピックはそれに従って一部モデルを停止しました。",
    span: "",
    op: "ask",
    question: "これは国際法的にはどういう扱いになるの？"
  },
];

for (const c of cases) {
  const parts = [];
  parts.push(`[親ノード本文 (この中からスパンが選択された)]\n${c.parent}`);
  if (c.span) parts.push(`[選択スパン] "${c.span}"`);
  if (c.question) parts.push(`[学習者の質問]\n${c.question}`);

  let opText;
  if (c.op === "what") {
    opText = `[操作] What is it — 親本文の文脈で「${c.span}」が何を指すか特定し、それが何であるかを具体的に掘り下げる。`;
  } else if (c.op === "why") {
    opText = `[操作] Why is it — 親本文の文脈で、なぜ「${c.span}」なのかを具体的に掘り下げる。`;
  } else {
    opText = c.span
      ? `[操作] 選択スパンについて学習者が問いを立てた。親の説明を超えて、この問いに正面から答える。親の繰り返しは不要。`
      : `[操作] 親本文について学習者が問いを立てた。親の説明を超えて、この問いに正面から答える。`;
  }
  parts.push(opText);

  const res = await client.responses.create({
    model: "gpt-5.4-mini",
    instructions: SYSTEM,
    input: parts.join("\n\n"),
    tools: [{ type: "web_search" }],
  });

  const u = res.usage;
  const searches = res.output.filter((o) => o.type === "web_search_call").length;
  const cost = u.input_tokens * 0.75 / 1e6 + u.output_tokens * 4.5 / 1e6;

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${c.name} | search:${searches} | ¥${(cost * 155).toFixed(2)}`);
  console.log(`${"=".repeat(50)}`);
  console.log(res.output_text);
}
