import { checkGuestRateLimit, getClientIp } from "@/lib/guestRateLimit";
import { consumeNodeQuota } from "@/lib/planLimits";
import { getRequestUser } from "@/lib/supabase/server";
import type { ExpandRequest } from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `あなたは Sondeur — 学習者が一つの概念をどこまでも深く掘り下げるためのアシスタント。

核心原則: 深化とは「親ノードが言っていないことを新たに足す」こと。
親の要約や言い換えは深化ではない。選択された概念について、親が触れなかった仕組み・背景・具体例・数値・比較を提示する。

応答ルール:
- 300〜500字。前置きや挨拶は書かない。
- 親の文脈は「なぜこの概念が出てきたか」を理解するためだけに使う。応答の主役は選択された概念そのもの。
- 読者が「もっと知りたい」と思えるフックを残す。関連する未説明の概念や意外な事実を示唆する。
- 平易な日本語。専門用語は初出で短く補足。
- マークダウンの見出しは使わない。段落と必要なら箇条書きのみ。
- web検索: 時事・最新ニュース・固有の事実には必ず検索する。一般原理の説明のみ検索不要。
- 事実性: 検索で確認した事実は断定してよい。検索できない場合のみ「〜とされる」と留保する。学習者の主張が正しいか怪しい場合も、まず検索してから判断する。`;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…(省略)";
}

function buildUserPrompt(req: ExpandRequest): string {
  const parts: string[] = [];
  if (req.pathSummaries.length > 0) {
    parts.push(`[ツリー概要]\n${req.pathSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }
  if (req.operation === "root") {
    parts.push(`[質問]\n${req.selectedSpan}`);
    parts.push(`[操作] この質問に答え、学習者が掘り下げの起点にできる説明をする`);
  } else if (req.operation === "ask") {
    if (req.grandparentContent) {
      parts.push(`[背景文脈 (参考程度)]\n${truncate(req.grandparentContent, 200)}`);
    }
    parts.push(`[親ノード本文]\n${req.parentContent}`);
    if (req.selectedSpan) {
      parts.push(`[選択スパン] "${req.selectedSpan}"`);
    }
    parts.push(`[学習者の質問]\n${req.question}`);
    parts.push(
      req.selectedSpan
        ? `[操作] 選択スパンについて学習者が問いを立てた。親の説明を超えて、この問いに正面から答える。親の繰り返しは不要。`
        : `[操作] 親本文について学習者が問いを立てた。親の説明を超えて、この問いに正面から答える。`
    );
  } else {
    if (req.grandparentContent) {
      parts.push(`[背景文脈 (参考程度)]\n${truncate(req.grandparentContent, 200)}`);
    }
    parts.push(`[親ノード本文 (この中からスパンが選択された)]\n${req.parentContent}`);
    parts.push(`[選択スパン] "${req.selectedSpan}"`);
    parts.push(
      req.operation === "what"
        ? `[操作] What is it — 「${req.selectedSpan}」とは何か。親が説明していない仕組み・構造・具体例を掘り下げる。親の文脈は出発点であって、応答の中心ではない。`
        : `[操作] Why is it — なぜ「${req.selectedSpan}」なのか。親が触れていない根拠・原理・歴史的背景・代替との比較を掘り下げる。`
    );
  }
  return parts.join("\n\n");
}

async function* mockStream(req: ExpandRequest): AsyncGenerator<string> {
  const label =
    req.operation === "what" ? "What is it" :
    req.operation === "why" ? "Why is it" :
    req.operation === "ask" ? `質問「${req.question}」` : "Root";
  const text =
    `（モック応答 — OPENAI_API_KEY を .env.local に設定すると実際のLLM応答になります）\n\n` +
    `「${req.selectedSpan}」についての ${label} の説明がここにストリーミングされます。` +
    `本番では、ツリー概要・親ノード本文・選択スパンをプロンプトに含めて、` +
    `選択概念と元文脈の関係まで踏み込んだ説明が生成されます。` +
    `たとえば単なる辞書的定義ではなく、この文脈でなぜその概念が登場するのか、` +
    `何がそれを可能にしているのか、までを300〜500字で簡潔に答えます。` +
    `このモックはUIの手触り（ピル→ノードが生える→ストリーミングで本文が埋まる）を確認するためのものです。`;
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
    // ask はスパンなし (空文字) を許す。それ以外はスパン必須
    (!body.selectedSpan && !isAsk) ||
    !["root", "what", "why", "ask"].includes(body.operation) ||
    // ask は質問文必須
    (isAsk && (typeof body.question !== "string" || !body.question.trim() || body.question.length > 1000)) ||
    !Array.isArray(body.pathSummaries) ||
    !body.pathSummaries.every((s) => typeof s === "string") ||
    typeof body.parentContent !== "string" ||
    (body.grandparentContent !== null && typeof body.grandparentContent !== "string")
  ) {
    return new Response("invalid request", { status: 400 });
  }

  // ログインユーザーにはノード生成数の総量制を適用 (SECURITY DEFINER関数でアトミックに消費)
  const auth = await getRequestUser();
  if (auth) {
    const check = await consumeNodeQuota(auth.supabase, auth.user);
    if (!check.ok) {
      return Response.json({ error: check.reason }, { status: 402 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // 未認証はIPベースの簡易レート制限 (クライアント側ゲスト枠の直叩き回避への保険)
    if (!checkGuestRateLimit(getClientIp(request))) {
      return Response.json(
        { error: "お試し枠を使い切りました。ログイン（無料）すると続けられます。" },
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
