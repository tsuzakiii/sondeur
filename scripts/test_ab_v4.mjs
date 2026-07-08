// A/B: 現行プロンプト (route.ts) vs 候補 v4
// 使い方: OPENAI_API_KEY=... node scripts/test_ab_v4.mjs [old|new]  (引数省略で両方)
import OpenAI from "openai";
import { readFileSync } from "node:fs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = "gpt-5.4-mini";

// ---- OLD: route.ts から抽出 ----
const routeSource = readFileSync("src/app/api/expand/route.ts", "utf8");
const OLD_SYSTEM = routeSource.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/)[1];

// ---- NEW: 候補 v4 ----
const NEW_SYSTEM = `You are Sondeur — a learning assistant. A learner reads an explanation, selects a phrase they don't fully understand, and asks "What is it" or "Why is it". Your job is to give them a real moment of understanding: after reading your answer, they should be able to explain the point in their own words.

How to answer:
1. First sentence: answer the question directly. Name the concrete thing the span refers to in this context — the specific product, law, event, person, or organization — not a generic definition.
2. Then explain the mechanism as one connected story: who does what, under which conditions, and what follows as a result. One causal chain told well beats many aspects touched briefly.
3. The story must be built on concrete facts the parent text does not contain — names, dates, numbers, quotes, clause numbers. If you cannot add such facts from what you know, search until you can. An answer that merely rephrases the parent in causal language is a failure.
4. Never blur specifics into "a major company" or "recently". Never restate or summarize the parent.

Depth budget — explain exactly one layer:
- Layer 0, the asked question itself: explain it fully. The reader must be completely satisfied on this point.
- Layer 1, the concepts your explanation stands on (laws, institutions, technologies, people, prior events): write them by their exact proper names, add at most one short appositive gloss, and do NOT explain them. They are next steps for the reader, not your job now.
- Layer 2 and beyond: leave out entirely. Do not open topics your explanation does not need.
- End on substance, not summary: let the last sentence carry its own fact — ideally one that opens the next layer. Never end by repeating a fact or date already stated, and never end with "要するに/in short" recaps.

Style:
- No preamble, no self-reference, no closing suggestions or invitations. End on a substantive fact.
- Plain language. Gloss technical terms briefly on first use.
- No markdown syntax. Paragraph breaks and "- " bullets only.

Web search and factuality:
- Search before answering anything time-sensitive or entity-specific: news, statistics, laws, product specs, companies, people, events. If the parent text describes a news event, always search — the span's real referent (which product, which order, which date) lives in the reporting, not in your memory. Purely conceptual explanations need no search.
- Report only what the sources support, keeping their names, dates and numbers exact. If sources conflict or are missing, note what is unconfirmed in one clause mid-answer — never as the opening.`;

// ---- ケース (test_v3 / test_quality から流用) ----
const PARENT_ANTHROPIC = "報道では、政府が外国籍の利用者への最先端モデルへのアクセスを止めるよう求め、アンソロピックはそれに従って一部モデルを停止しました。";
const PARENT_JASRAC = "JASRACは、AI生成楽曲には著作権が発生しないという見解を示しました。人間の創作的関与がなければ著作物にはあたらないとしています。";

const cases = [
  { name: "ROOT: Anthropic停止", op: "root", span: "トランプ政権はなぜAnthropicにAI提供停止を命じた？" },
  { name: "WHAT: 最先端モデル", op: "what", parent: PARENT_ANTHROPIC, span: "最先端モデル" },
  { name: "WHY: アクセスを止めるよう求め", op: "why", parent: PARENT_ANTHROPIC, span: "アクセスを止めるよう求め" },
  { name: "WHAT: 著作権が発生しない (概念系)", op: "what", parent: PARENT_JASRAC, span: "著作権が発生しない" },
  { name: "ASK: 国際法", op: "ask", parent: PARENT_ANTHROPIC, span: "", question: "これは国際法的にはどういう扱いになるの？" },
];

// ---- OLD の user prompt (route.ts 現行 buildUserPrompt の ja 分岐を再現) ----
function buildOld(c) {
  const parts = ["[Language] Answer in Japanese."];
  if (c.op === "root") {
    parts.push(`[質問]\n${c.span}`);
    parts.push(`[操作] この質問に答える。まず検索して最新の事実を押さえる。同じテーマで複数時期の出来事がある場合、最も新しいものを中心に据える。質問の中心にある具体的な対象・出来事・制度・技術を名指しし、なぜそれが問題になるのかを関係者・仕組み・対立軸・制約の流れで説明する。`);
  } else if (c.op === "ask") {
    parts.push(`[親ノード本文]\n${c.parent}`);
    parts.push(`[学習者の質問]\n${c.question}`);
    parts.push(`[操作] 学習者が親本文について自由質問をした。質問に正面から答える。親本文の繰り返しは禁止。親を前提に、一段深い情報・具体例・例外・数字・固有名詞・判断基準を足す。`);
  } else {
    parts.push(`[親ノード本文 (この中からスパンが選択された)]\n${c.parent}`);
    parts.push(`[選択スパン] "${c.span}"`);
    parts.push(c.op === "what"
      ? `[操作] What is it — まず「${c.span}」が一般にどういう概念・制度・仕組みかを1〜2文で端的に説明する（初学者が辞書を引かなくて済む程度）。次に、親本文の文脈でそれが具体的にどう使われている・どう効いているかを掘り下げる。構成要素、関係者、発生時期、使われる場面、似ているが違う概念のうち少なくとも2つを入れる。親に出ていない固有名詞・数値・制度名・部品名・具体例を必ず足す。`
      : `[操作] Why is it — 親本文の文脈で、なぜ「${c.span}」がそうなるのかを掘り下げる。背後にある原因や力学を名指しする。原因、条件、制約、インセンティブ、例外、失敗条件のうち少なくとも3つをつなげて説明する。抽象的な「影響がある」「重要だから」ではなく、誰が・何を・どの条件で・どう変えるのかを書く。`);
  }
  return parts.join("\n\n");
}

// ---- NEW の user prompt (候補 v4) ----
function buildNew(c) {
  const parts = ["[Language] 日本語で答える。全体で400〜600字。"];
  if (c.op === "root") {
    parts.push(`[質問]\n${c.span}`);
    parts.push(`[操作] この質問に答える。まず検索して事実を押さえる（同じテーマで複数時期の出来事があれば最新を中心に）。中心にある具体的な対象・出来事・制度を名指しし、なぜそうなったのかを一本の因果の流れとして語る。`);
  } else if (c.op === "ask") {
    parts.push(`[親ノード本文]\n${c.parent}`);
    parts.push(`[学習者の質問]\n${c.question}`);
    parts.push(`[操作] 学習者が親本文について質問をした。質問そのものに正面から答えきる。親の繰り返しは書かず、親より一段深い事実と因果でつなぐ。`);
  } else {
    parts.push(`[親ノード本文 (この中からスパンが選択された)]\n${c.parent}`);
    parts.push(`[選択スパン] "${c.span}"`);
    parts.push(c.op === "what"
      ? `[操作] What is it — 「${c.span}」がこの文脈で具体的に何を指すかをまず1〜2文で言い切る（初学者が辞書を引かなくて済むように）。続けて、それがどう成り立ち・どう働いているのかを、この文脈に即して一本の筋で説明する。説明を最も助ける具体的な事実（固有名詞・数値・時期・実例）を選んで深く使う。`
      : `[操作] Why is it — なぜ「${c.span}」なのか、実際に報じられている・確認できる理由を最初の1文で言い切る（一般論の推測で代用しない。必要なら検索）。続けて、誰が・何を・どの条件で行い、その結果何が起きたのかを、親にない具体的事実（日付・人名・組織名・数値）でつないで説明する。理由が複数あるなら最も効いている一つを深く、残りは短く。`);
  }
  return parts.join("\n\n");
}

async function run(label, system, build, c) {
  const t0 = Date.now();
  const res = await client.responses.create({
    model: MODEL,
    instructions: system,
    input: build(c),
    tools: [{ type: "web_search" }],
  });
  const searches = res.output.filter((o) => o.type === "web_search_call").length;
  const cost = res.usage.input_tokens * 0.75 / 1e6 + res.usage.output_tokens * 4.5 / 1e6;
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${label}] ${c.name} | search:${searches} | ${secs}s | ¥${(cost * 155).toFixed(2)} | ${res.output_text.length}字`);
  console.log("=".repeat(60));
  console.log(res.output_text);
}

const which = process.argv[2]; // old / new / undefined=both
for (const c of cases) {
  if (which !== "new") await run("OLD", OLD_SYSTEM, buildOld, c);
  if (which !== "old") await run("NEW", NEW_SYSTEM, buildNew, c);
}
