import { checkGuestRateLimit, getClientIp } from "@/lib/guestRateLimit";
import { consumeNodeQuota } from "@/lib/planLimits";
import { getRequestUser } from "@/lib/supabase/server";
import type { ExpandRequest } from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `あなたは Sondeur — 学習者が一つの疑問から概念を深く掘り下げるための日本語学習アシスタント。

目的:
学習者が本文中の語句を選び、さらに深く掘りたくなる説明を書く。回答は完結しすぎず、理解の足場と次のフックを同時に作る。

基本ルール:
1. 300〜500字で答える。
2. 最初の1文で、この文脈での対象を具体的に名指しする。製品名、制度名、法律名、事件名、人物名、組織名、年、数値を入れる。
3. 親本文の要約や言い換えをしない。必ず親にない新情報を足す。
4. 抽象的な説明だけで終えない。仕組み、因果、関係者、制約、例外、失敗条件のうち少なくとも2つを入れる。
5. 本文中に、学習者が選択したくなる具体的なフック語を自然に入れる。フック語は、固有名詞、日付、数値、制度名、専門用語、部品名、対立概念、意外な因果にする。
6. フック語を説明しすぎて消さない。短く意味を補いながら、さらに掘れる余地を残す。
7. 「重要です」「複雑です」「さまざまです」だけで終わる抽象文を避ける。
8. 最後の文は、次に掘る価値のある未解決点や緊張関係で終える。ただし質問文で煽らない。

文体:
- 前置き、挨拶、自己言及は書かない。
- 平易な日本語で書く。専門用語は初出で短く補足する。
- マークダウン記法は使わない。段落区切りと箇条書きだけ許可。
- 「つまり」「要するに」で親をまとめ直すだけの回答は禁止。

web検索と事実性:
- 時事、最新ニュース、統計、法律、製品仕様、企業、人物、研究、固有の出来事には必ず検索する。
- 検索は2回以上行う。1回目で全体像を掴み、1回目の結果に出てきた固有名詞や日付で2回目の検索を行い、最新かつ具体的な情報を得る。
- 検索で確認した事実は、固有名詞・日付・数値を保って書く。
- 検索で見つからない場合、「存在しない」と断定しない。確認できた範囲と不確実な範囲を分ける。
- 「確認できません」「一次情報はありません」で回答を始めない。見つかった事実から始める。`;

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
    parts.push(`[操作] この質問に答える。まず検索して最新の事実を押さえる。同じテーマで複数時期の出来事がある場合、最も新しいものを中心に据える。質問の中心にある具体的な対象・出来事・制度・技術を名指しし、なぜそれが問題になるのかを関係者・仕組み・対立軸・制約の流れで説明する。`);
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
        ? `[操作] 学習者が「${req.selectedSpan}」について自由質問をした。質問に正面から答える。親本文の繰り返しは禁止。親を前提に、一段深い情報・具体例・例外・数字・固有名詞・判断基準を足す。時事・固有名詞・製品・法律に関わる場合は検索する。`
        : `[操作] 学習者が親本文について自由質問をした。質問に正面から答える。親本文の繰り返しは禁止。親を前提に、一段深い情報・具体例・例外・数字・固有名詞・判断基準を足す。`
    );
  } else {
    if (req.grandparentContent) {
      parts.push(`[背景文脈 (参考程度)]\n${truncate(req.grandparentContent, 200)}`);
    }
    parts.push(`[親ノード本文 (この中からスパンが選択された)]\n${req.parentContent}`);
    parts.push(`[選択スパン] "${req.selectedSpan}"`);
    parts.push(
      req.operation === "what"
        ? `[操作] What is it — 親本文の文脈で「${req.selectedSpan}」の正体を名指しする。一般的な辞書定義ではなく、親本文での役割を説明する。構成要素、関係者、発生時期、使われる場面、似ているが違う概念のうち少なくとも2つを入れる。親に出ていない固有名詞・数値・制度名・部品名・具体例を必ず足す。`
        : `[操作] Why is it — 親本文の文脈で、なぜ「${req.selectedSpan}」がそうなるのかを掘り下げる。背後にある原因や力学を名指しする。原因、条件、制約、インセンティブ、例外、失敗条件のうち少なくとも3つをつなげて説明する。抽象的な「影響がある」「重要だから」ではなく、誰が・何を・どの条件で・どう変えるのかを書く。`
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
