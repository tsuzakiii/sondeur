import { checkGuestRateLimit, getClientIp } from "@/lib/guestRateLimit";
import { consumeNodeQuota } from "@/lib/planLimits";
import { getRequestUser } from "@/lib/supabase/server";
import type { ExpandRequest } from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are Sondeur — a learning assistant. A learner reads an explanation, selects a phrase they don't fully understand, and asks "What is it" or "Why is it". Your job is to give them a real moment of understanding: after reading your answer, they should be able to explain the point in their own words.

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

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…(truncated)";
}

function buildUserPrompt(req: ExpandRequest): string {
  const ja = req.lang === "ja";
  const parts: string[] = [
    ja ? "[Language] 日本語で答える。全体で400〜600字。" : "[Language] Answer in English, 200-300 words.",
  ];

  if (req.pathSummaries.length > 0) {
    const header = ja ? "[ツリー概要]" : "[Tree overview]";
    parts.push(`${header}\n${req.pathSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }

  if (req.operation === "root") {
    parts.push(`${ja ? "[質問]" : "[Question]"}\n${req.selectedSpan}`);
    parts.push(ja
      ? `[操作] この質問に答える。まず検索して事実を押さえる（同じテーマで複数時期の出来事があれば最新を中心に）。中心にある具体的な対象・出来事・制度を名指しし、なぜそうなったのかを一本の因果の流れとして語る。`
      : `[Operation] Answer this question. Search for the facts first (if there are multiple events on the same theme across different periods, center the most recent). Name the specific subjects, events, or institutions at the heart of the question and tell why it happened as one causal thread.`
    );
  } else if (req.operation === "ask") {
    if (req.grandparentContent) {
      parts.push(`${ja ? "[背景文脈 (参考程度)]" : "[Background context (for reference)]"}\n${truncate(req.grandparentContent, 200)}`);
    }
    parts.push(`${ja ? "[親ノード本文]" : "[Parent node text]"}\n${req.parentContent}`);
    if (req.selectedSpan) {
      parts.push(`${ja ? "[選択スパン]" : "[Selected span]"} "${req.selectedSpan}"`);
    }
    parts.push(`${ja ? "[学習者の質問]" : "[Learner's question]"}\n${req.question}`);
    parts.push(
      req.selectedSpan
        ? (ja
          ? `[操作] 学習者が「${req.selectedSpan}」について自由質問をした。質問そのものに正面から答えきる。親の繰り返しは書かず、親より一段深い事実と因果でつなぐ。時事・固有名詞・製品・法律に関わる場合は検索する。`
          : `[Operation] The learner asked a free-form question about "${req.selectedSpan}". Answer the question itself head-on. Do not repeat the parent; connect facts one level deeper than the parent through cause and effect. Search when the topic involves current events, proper nouns, products, or laws.`)
        : (ja
          ? `[操作] 学習者が親本文について質問をした。質問そのものに正面から答えきる。親の繰り返しは書かず、親より一段深い事実と因果でつなぐ。`
          : `[Operation] The learner asked a free-form question about the parent text. Answer the question itself head-on. Do not repeat the parent; connect facts one level deeper than the parent through cause and effect.`)
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

async function* mockStream(req: ExpandRequest): AsyncGenerator<string> {
  const label =
    req.operation === "what" ? "What is it" :
    req.operation === "why" ? "Why is it" :
    req.operation === "ask" ? `Ask "${req.question}"` : "Root";
  const text =
    `(Mock response — set OPENAI_API_KEY in .env.local for real LLM responses)\n\n` +
    `An explanation of "${req.selectedSpan}" via ${label} would stream here. ` +
    `In production, the tree overview, parent text, and selected span are included in the prompt ` +
    `to generate an explanation that goes beyond a dictionary definition — covering why this concept ` +
    `appears in context, what makes it possible, and what tensions remain, in 200-400 words. ` +
    `This mock is for testing the UI flow (pill -> node spawns -> text streams in).`;
  for (let i = 0; i < text.length; i += 4) {
    yield text.slice(i, i + 4);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function* openaiStream(req: ExpandRequest): AsyncGenerator<string> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.SONDEUR_MODEL ?? "gpt-5.4-mini";
  const stream = await client.responses.create({
    model,
    stream: true,
    instructions: SYSTEM_PROMPT,
    input: buildUserPrompt(req),
    tools: [{ type: "web_search" as const }],
  });
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      yield event.delta;
    }
  }
}

export async function POST(request: Request) {
  let body: ExpandRequest;
  try {
    body = (await request.json()) as ExpandRequest;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const isAsk = body.operation === "ask";
  if (
    typeof body.selectedSpan !== "string" ||
    body.selectedSpan.length > 500 ||
    (!body.selectedSpan && !isAsk) ||
    !["root", "what", "why", "ask"].includes(body.operation) ||
    (isAsk && (typeof body.question !== "string" || !body.question.trim() || body.question.length > 1000)) ||
    !Array.isArray(body.pathSummaries) ||
    body.pathSummaries.length > 50 ||
    !body.pathSummaries.every((s) => typeof s === "string" && s.length <= 200) ||
    typeof body.parentContent !== "string" ||
    body.parentContent.length > 8000 ||
    (body.grandparentContent !== null && typeof body.grandparentContent !== "string") ||
    (typeof body.grandparentContent === "string" && body.grandparentContent.length > 4000)
  ) {
    return new Response("invalid request", { status: 400 });
  }

  // Normalize lang
  if (body.lang !== "ja") body.lang = "en";

  const auth = await getRequestUser();
  if (auth) {
    const check = await consumeNodeQuota(auth.supabase, auth.user);
    if (!check.ok) {
      const reason = body.lang === "en"
        ? "Monthly node limit reached. Resets next month."
        : check.reason;
      return Response.json({ error: reason }, { status: 402 });
    }
  } else if (process.env.NODE_ENV === "production") {
    if (!(await checkGuestRateLimit(getClientIp(request)))) {
      return Response.json(
        { error: body.lang === "ja"
          ? "お試し枠を使い切りました。ログイン（無料）すると続けられます。"
          : "Trial exhausted. Sign in (free) to continue."
        },
        { status: 402 }
      );
    }
  }

  const useMock = !process.env.OPENAI_API_KEY;
  const gen = useMock ? mockStream(body) : openaiStream(body);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of gen) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
