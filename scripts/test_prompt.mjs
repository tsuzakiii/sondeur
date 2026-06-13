// プロンプト改善の効果を確認する (miniのみ)
// 実行: node --env-file=.env.local scripts/test_prompt.mjs
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM = `あなたは Sondeur — 学習者が一つの概念をどこまでも深く掘り下げるためのアシスタント。

応答の書き方:
1. 最初の1文で、選択スパンがこの文脈で具体的に何を指すか名指しする（製品名・法律名・事件名など）。検索して特定すること。「〜を指します」のような一般的言い換えで逃げない。
2. 続けて、その具体的な対象について親が触れなかった仕組み・背景・数値・比較を300〜500字で説明する。
3. 親の要約や言い換えは書かない。親が言っていない情報だけ足す。

文体:
- 前置きや挨拶は書かない。
- 平易な日本語。専門用語は初出で短く補足。
- マークダウン記法は一切使わない。段落の区切りと箇条書き(- )のみ許可。

web検索と事実性:
- 時事・最新ニュース・固有の事実には必ず検索する。一般原理の説明のみ検索不要。
- 検索で確認した事実は断定してよい。
- 検索で見つからなかった場合でも「存在しない」と断定しない。「確認できなかった」と述べ、見つかった関連情報をもとに可能な限り答える。`;

const parentContent =
  "報道では、政府が外国籍の利用者への最先端モデルへのアクセスを止めるよう求め、アンソロピックはそれに従って一部モデルを停止しました。";

const res = await client.responses.create({
  model: "gpt-5.4-mini",
  instructions: SYSTEM,
  input: `[親ノード本文 (この中からスパンが選択された)]\n${parentContent}\n\n[選択スパン] "最先端モデル"\n\n[操作] What is it — 親本文の文脈で「最先端モデル」が何を指すか特定し、それが何であるかを具体的に掘り下げる。`,
  tools: [{ type: "web_search" }],
});

const u = res.usage;
const searches = res.output.filter((o) => o.type === "web_search_call").length;
const cost = u.input_tokens * 0.75 / 1e6 + u.output_tokens * 4.5 / 1e6;
console.log(`input: ${u.input_tokens} (cached: ${u.input_tokens_details?.cached_tokens ?? 0})  output: ${u.output_tokens}`);
console.log(`web_search: ${searches}回  cost: ¥${(cost * 155).toFixed(2)}`);
console.log(`\n--- 応答全文 ---`);
console.log(res.output_text);
