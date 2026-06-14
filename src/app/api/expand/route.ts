import { checkGuestRateLimit, getClientIp } from "@/lib/guestRateLimit";
import { consumeNodeQuota } from "@/lib/planLimits";
import { getRequestUser } from "@/lib/supabase/server";
import type { ExpandRequest } from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `あなたは Sondeur — 学習者が一つの概念をどこまでも深く掘り下げるためのアシスタント。

応答の書き方:
1. 最初の1文で、選択スパンがこの文脈で具体的に何を指すか名指しする（製品名・法律名・事件名など）。検索して特定する。
2. 構造を説明する。「なぜそうなるか」「どう動くか」の仕組みや因果関係を見せる。
3. 細部は具体語のまま残す。固有名詞・数値・日付・条文番号を抽象化しない。「高性能なモデル」ではなく「Fable 5」、「最近」ではなく「2026年6月13日」と書く。
4. 親が言っていない新しい情報を足す。親の要約や言い換えは書かない。
5. 300〜500字。

文体:
- 前置きや挨拶は書かない。
- 平易な日本語。専門用語は初出で短く補足。
- マークダウン記法は一切使わない。見出し(#)、太字(**)、リンク記法、コードブロックすべて禁止。段落の区切りと箇条書き(- )のみ許可。

web検索と事実性:
- 時事・最新ニュース・固有の事実には必ず検索する。一般原理の説明のみ検索不要。
- 検索で確認した事実は断定してよい。
- 検索で見つからなかった場合でも「存在しない」と断定しない。「確認できなかった」と述べ、見つかった関連情報をもとに可能な限り答える。`;

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
        ? `[操作] What is it — 親本文の文脈で「${req.selectedSpan}」が何を指すか特定し、それが何であるかを具体的に掘り下げる。`
        : `[操作] Why is it — 親本文の文脈で、なぜ「${req.selectedSpan}」なのかを具体的に掘り下げる。`
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
