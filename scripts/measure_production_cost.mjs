// Production-like cost measurement for Sondeur prompts.
// Run: node --env-file=.env.local scripts/measure_production_cost.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(path.join(__dirname, "../src/app/api/expand/route.ts"), "utf8");
const systemMatch = routeSource.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
if (!systemMatch) throw new Error("SYSTEM_PROMPT not found in route.ts");

const SYSTEM_PROMPT = systemMatch[1];
const WEB_SEARCH_CALL_USD = 10 / 1000;

const PRICES = {
  "gpt-5.4-mini": { input: 0.375 / 1e6, cachedInput: 0.0375 / 1e6, output: 2.25 / 1e6 },
};

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…(truncated)`;
}

function buildUserPrompt(req) {
  const ja = req.lang === "ja";
  const parts = [
    ja ? "[Language] 日本語で答える。全体で400〜600字。" : "[Language] Answer in English, 200-300 words.",
  ];

  if (req.pathSummaries.length > 0) {
    const header = ja ? "[ツリー概要]" : "[Tree overview]";
    parts.push(`${header}\n${req.pathSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }

  if (req.operation === "root") {
    parts.push(`${ja ? "[質問]" : "[Question]"}\n${req.selectedSpan}`);
    parts.push(ja
      ? "[操作] この質問に答える。まず検索して事実を押さえる（同じテーマで複数時期の出来事があれば最新を中心に）。中心にある具体的な対象・出来事・制度を名指しし、なぜそうなったのかを一本の因果の流れとして語る。"
      : "[Operation] Answer this question. Search for the facts first (if there are multiple events on the same theme across different periods, center the most recent). Name the specific subjects, events, or institutions at the heart of the question and tell why it happened as one causal thread."
    );
  } else if (req.operation === "ask") {
    if (req.grandparentContent) {
      parts.push(`${ja ? "[背景文脈 (参考程度)]" : "[Background context (for reference)]"}\n${truncate(req.grandparentContent, 200)}`);
    }
    parts.push(`${ja ? "[親ノード本文]" : "[Parent node text]"}\n${req.parentContent}`);
    if (req.selectedSpan) parts.push(`${ja ? "[選択スパン]" : "[Selected span]"} "${req.selectedSpan}"`);
    parts.push(`${ja ? "[学習者の質問]" : "[Learner's question]"}\n${req.question}`);
    parts.push(
      req.selectedSpan
        ? (ja
          ? `[操作] 学習者が「${req.selectedSpan}」について自由質問をした。質問そのものに正面から答えきる。親の繰り返しは書かず、親より一段深い事実と因果でつなぐ。時事・固有名詞・製品・法律に関わる場合は検索する。`
          : `[Operation] The learner asked a free-form question about "${req.selectedSpan}". Answer the question itself head-on. Do not repeat the parent; connect facts one level deeper than the parent through cause and effect. Search when the topic involves current events, proper nouns, products, or laws.`)
        : (ja
          ? "[操作] 学習者が親本文について質問をした。質問そのものに正面から答えきる。親の繰り返しは書かず、親より一段深い事実と因果でつなぐ。"
          : "[Operation] The learner asked a free-form question about the parent text. Answer the question itself head-on. Do not repeat the parent; connect facts one level deeper than the parent through cause and effect.")
    );
  } else {
    if (req.grandparentContent) {
      parts.push(`${ja ? "[背景文脈 (参考程度)]" : "[Background context (for reference)]"}\n${truncate(req.grandparentContent, 200)}`);
    }
    parts.push(`${ja ? "[親ノード本文 (この中からスパンが選択された)]" : "[Parent node text (span selected from this)]"}\n${req.parentContent}`);
    parts.push(`${ja ? "[選択スパン]" : "[Selected span]"} "${req.selectedSpan}"`);
    parts.push(
      req.operation === "what"
        ? (ja
          ? `[操作] What is it — 「${req.selectedSpan}」がこの文脈で具体的に何を指すかをまず1〜2文で言い切る（初学者が辞書を引かなくて済むように）。続けて、それがどう成り立ち・どう働いているのかを、この文脈に即して一本の筋で説明する。説明を最も助ける具体的な事実（固有名詞・数値・時期・実例）を選んで深く使う。`
          : `[Operation] What is it — First state in 1-2 sentences what "${req.selectedSpan}" concretely refers to in this context (enough that a beginner doesn't need to look it up). Then explain how it comes about and how it works, as one thread grounded in this context. Pick the concrete facts that best carry the explanation — proper nouns, numbers, dates, real examples — and use them in depth.`)
        : (ja
          ? `[操作] Why is it — なぜ「${req.selectedSpan}」なのか、実際に報じられている・確認できる理由を最初の1文で言い切る（一般論の推測で代用しない。必要なら検索）。続けて、誰が・何を・どの条件で行い、その結果何が起きたのかを、親にない具体的事実（日付・人名・組織名・数値）でつないで説明する。理由が複数あるなら最も効いている一つを深く、残りは短く。`
          : `[Operation] Why is it — State the actual, reported or verifiable reason why "${req.selectedSpan}" in your first sentence (do not substitute generic speculation; search if needed). Then explain who did what, under which conditions, and what happened as a result — connected through concrete facts not present in the parent (dates, names, organizations, numbers). If there are multiple reasons, go deep on the one that matters most and keep the rest short.`)
    );
  }
  return parts.join("\n\n");
}

function assertPromptEncoding(label, prompt) {
  const required = ["日本語", "親ノード本文", "選択スパン", "操作"];
  for (const needle of required) {
    if (!prompt.includes(needle)) throw new Error(`${label}: missing expected Japanese marker: ${needle}`);
  }
  if (prompt.includes("�")) throw new Error(`${label}: prompt contains replacement character`);
  if (/\?{3,}/.test(prompt)) throw new Error(`${label}: prompt contains suspicious question-mark run`);
}

function estimateCost(usage, searches, price) {
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const uncached = Math.max(0, usage.input_tokens - cached);
  const tokenCost = uncached * price.input + cached * price.cachedInput + usage.output_tokens * price.output;
  const searchCost = searches * WEB_SEARCH_CALL_USD;
  return { tokenCost, searchCost, total: tokenCost + searchCost };
}

const cases = [
  {
    name: "concept-what-transformer",
    req: {
      lang: "ja",
      operation: "what",
      selectedSpan: "自己注意機構",
      parentContent:
        "Transformerは、自己注意機構によって文中の各単語がほかの単語とどれだけ関係するかを同時に計算し、長い文脈を保ったまま文章を処理するニューラルネットワークです。",
      grandparentContent: null,
      pathSummaries: [],
    },
  },
  {
    name: "search-why-ai-export-controls",
    req: {
      lang: "ja",
      operation: "why",
      selectedSpan: "アクセスを止めるよう求め",
      parentContent:
        "報道では、政府が外国籍の利用者への最先端モデルへのアクセスを止めるよう求め、アンソロピックはそれに従って一部モデルを停止しました。",
      grandparentContent: null,
      pathSummaries: [],
    },
  },
];

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is missing. Run: node --env-file=.env.local scripts/measure_production_cost.mjs");
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.SONDEUR_MODEL ?? "gpt-5.4-mini";
const price = PRICES[model];
if (!price) throw new Error(`No price table for ${model}`);

for (const c of cases) {
  const input = buildUserPrompt(c.req);
  assertPromptEncoding(c.name, input);

  const res = await client.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input,
    tools: [{ type: "web_search" }],
    max_output_tokens: 4000,
  });

  const searches = res.output.filter((o) => o.type === "web_search_call").length;
  const cost = estimateCost(res.usage, searches, price);
  const cached = res.usage.input_tokens_details?.cached_tokens ?? 0;
  const reasoning = res.usage.output_tokens_details?.reasoning_tokens ?? 0;

  console.log(`\n== ${c.name} ==`);
  console.log(`model=${model}`);
  console.log(`prompt_preview=${JSON.stringify(input.slice(0, 180))}`);
  console.log(`input=${res.usage.input_tokens} cached=${cached} output=${res.usage.output_tokens} reasoning=${reasoning} web_search=${searches}`);
  console.log(`token_cost=$${cost.tokenCost.toFixed(5)} search_cost=$${cost.searchCost.toFixed(5)} total=$${cost.total.toFixed(5)}`);
  console.log(`output_preview=${JSON.stringify((res.output_text ?? "").slice(0, 180))}`);
}
