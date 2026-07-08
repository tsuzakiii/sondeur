import { checkGuestRateLimit, getClientIp } from "@/lib/guestRateLimit";
import { consumeNodeQuota } from "@/lib/planLimits";
import { getRequestUser } from "@/lib/supabase/server";
import type { ExpandRequest } from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are Sondeur — a learning assistant that helps learners drill deep into concepts from a single question.

Purpose:
Write explanations that make the learner want to select phrases and dig deeper. Answers should not be self-contained — build scaffolding and hooks for the next exploration.

Rules:
1. Answer in 200-400 words.
2. Open with a concrete identification of the subject in context. Include product names, institution names, laws, events, people, organizations, years, and numbers.
3. Do not paraphrase or summarize the parent text. Always add new information not present in the parent.
4. Do not end with abstract statements alone. Include at least 2 of: mechanisms, causation, stakeholders, constraints, exceptions, failure conditions.
5. Naturally embed specific hook terms that the learner will want to select. Hook terms should be proper nouns, dates, numbers, institution names, technical terms, component names, opposing concepts, or surprising causation.
6. Do not over-explain hook terms. Briefly contextualize them while leaving room for further exploration.
7. Avoid sentences that end with only "is important", "is complex", or "varies widely".

Style:
- No preamble, greetings, or self-reference.
- Write in clear, accessible language. Briefly gloss technical terms on first use.
- No markdown formatting. Only paragraph breaks and bullet points allowed.
- Never start by simply restating the parent with "In other words" or "Essentially".
- Do not end with suggestions, proposals, or leading questions. End with a factual statement.

Web search and factuality:
- Always search for current events, news, statistics, laws, product specs, companies, people, research, and specific events.
- Search at least twice. First to get an overview, then use proper nouns and dates from the first results for a more specific second search.
- Preserve proper nouns, dates, and numbers from search results.
- If a search yields nothing, do not assert "does not exist". Distinguish between confirmed and uncertain information.
- Do not begin with "Cannot confirm" or "No primary sources found". Start from confirmed facts.`;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…(truncated)";
}

function buildUserPrompt(req: ExpandRequest): string {
  const ja = req.lang === "ja";
  const parts: string[] = [
    ja ? "[Language] Answer in Japanese." : "[Language] Answer in English.",
  ];

  if (req.pathSummaries.length > 0) {
    const header = ja ? "[ツリー概要]" : "[Tree overview]";
    parts.push(`${header}\n${req.pathSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }

  if (req.operation === "root") {
    parts.push(`${ja ? "[質問]" : "[Question]"}\n${req.selectedSpan}`);
    parts.push(ja
      ? `[操作] この質問に答える。まず検索して最新の事実を押さえる。同じテーマで複数時期の出来事がある場合、最も新しいものを中心に据える。質問の中心にある具体的な対象・出来事・制度・技術を名指しし、なぜそれが問題になるのかを関係者・仕組み・対立軸・制約の流れで説明する。`
      : `[Operation] Answer this question. Search for the latest facts first. If there are multiple events on the same theme across different periods, focus on the most recent. Name the specific subjects, events, institutions, or technologies at the heart of the question and explain why they matter through stakeholders, mechanisms, tensions, and constraints.`
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
          ? `[操作] 学習者が「${req.selectedSpan}」について自由質問をした。質問に正面から答える。親本文の繰り返しは禁止。親を前提に、一段深い情報・具体例・例外・数字・固有名詞・判断基準を足す。時事・固有名詞・製品・法律に関わる場合は検索する。`
          : `[Operation] The learner asked a free-form question about "${req.selectedSpan}". Answer the question directly. Do not repeat the parent text. Build on the parent with deeper information, concrete examples, exceptions, numbers, proper nouns, and criteria. Search when the topic involves current events, proper nouns, products, or laws.`)
        : (ja
          ? `[操作] 学習者が親本文について自由質問をした。質問に正面から答える。親本文の繰り返しは禁止。親を前提に、一段深い情報・具体例・例外・数字・固有名詞・判断基準を足す。`
          : `[Operation] The learner asked a free-form question about the parent text. Answer directly. Do not repeat the parent. Build on it with deeper information, examples, exceptions, numbers, proper nouns, and criteria.`)
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
          ? `[操作] What is it — まず「${req.selectedSpan}」が一般にどういう概念・制度・仕組みかを1〜2文で端的に説明する（初学者が辞書を引かなくて済む程度）。次に、親本文の文脈でそれが具体的にどう使われている・どう効いているかを掘り下げる。構成要素、関係者、発生時期、使われる場面、似ているが違う概念のうち少なくとも2つを入れる。親に出ていない固有名詞・数値・制度名・部品名・具体例を必ず足す。`
          : `[Operation] What is it — First explain in 1-2 sentences what "${req.selectedSpan}" generally is as a concept, institution, or mechanism (enough that a beginner doesn't need to look it up). Then dig into how it specifically works or matters in the context of the parent text. Include at least 2 of: components, stakeholders, timeline, use cases, or concepts that look similar but differ. Add proper nouns, numbers, institution names, part names, or concrete examples not present in the parent.`)
        : (ja
          ? `[操作] Why is it — 親本文の文脈で、なぜ「${req.selectedSpan}」がそうなるのかを掘り下げる。背後にある原因や力学を名指しする。原因、条件、制約、インセンティブ、例外、失敗条件のうち少なくとも3つをつなげて説明する。抽象的な「影響がある」「重要だから」ではなく、誰が・何を・どの条件で・どう変えるのかを書く。`
          : `[Operation] Why is it — Dig into why "${req.selectedSpan}" is the way it is in the context of the parent text. Name the underlying causes and dynamics. Connect at least 3 of: causes, conditions, constraints, incentives, exceptions, or failure conditions. Instead of abstract statements like "has an impact" or "is important", write who does what, under what conditions, and what changes.`)
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
    max_output_tokens: 4000,
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
  } else if (process.env.NODE_ENV !== "development") {
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
