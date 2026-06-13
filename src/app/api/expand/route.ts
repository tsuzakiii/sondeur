import { checkGuestRateLimit, getClientIp } from "@/lib/guestRateLimit";
import { consumeNodeQuota } from "@/lib/planLimits";
import { getRequestUser } from "@/lib/supabase/server";
import type { ExpandRequest } from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `あなたは Sondeur — 学習者が概念を掘り下げるためのアシスタント。

応答ルール:
- 簡潔に。300〜500字程度。前置きや挨拶は書かない。
- ただし、選択された概念と元の文脈との関係まで必ず踏み込む。
  例: 「水素だから可能で、メタンでは不可」のように、文脈固有の理由まで言い切る。
- 一般論の辞書的説明で止まらない。「この文脈でなぜそれが登場するのか」を含める。
- 平易な日本語。専門用語を使う場合は初出で短く補足する。
- マークダウンの見出しは使わない。段落と必要なら箇条書きのみ。
- 事実性の規律: 物理的・論理的な仕組みの説明は踏み込んでよいが、
  設計動機・歴史的経緯・固有名詞に紐づく事実は確信がある場合のみ断定する。
  不確かな場合は「〜とされる」「〜の可能性がある」と推測であることを明示し、
  もっともらしい動機づけを創作しない。
- web検索の使い分け: 設計動機・歴史的経緯・仕様値など固有の事実に
  確信が持てない時は検索で裏を取る。一般的な概念説明や、与えられた文脈から
  論理的に導ける説明は検索せずに答える。`;

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
      parts.push(`[祖父ノード本文]\n${req.grandparentContent}`);
    }
    parts.push(`[親ノード本文]\n${req.parentContent}`);
    if (req.selectedSpan) {
      parts.push(`[選択スパン] "${req.selectedSpan}"`);
    }
    parts.push(`[学習者の質問]\n${req.question}`);
    parts.push(
      req.selectedSpan
        ? `[操作] 選択スパンについての学習者の質問に、親本文の文脈に即して答える`
        : `[操作] 親本文についての学習者の質問に、その文脈に即して答える`
    );
  } else {
    if (req.grandparentContent) {
      parts.push(`[祖父ノード本文]\n${req.grandparentContent}`);
    }
    parts.push(`[親ノード本文 (この中からスパンが選択された)]\n${req.parentContent}`);
    parts.push(`[選択スパン] "${req.selectedSpan}"`);
    parts.push(
      req.operation === "what"
        ? `[操作] What is it — 選択スパンが何であるかを、親本文の文脈に即して説明する`
        : `[操作] Why is it — 親本文の文脈で、なぜそうなのか・なぜそれが使われる/成り立つのかを説明する`
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
    reasoning: { effort: "low" },
    // 検索は常時利用可能にし、使うかどうかはモデルの判断に委ねる
    // (コスト制御はシステムプロンプトの「文脈と知識で足りるなら検索しない」で行う)
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
