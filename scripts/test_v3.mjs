import OpenAI from "openai";
import { readFileSync } from "node:fs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// route.ts から現在のプロンプトを読み取って使う
const routeSource = readFileSync("src/app/api/expand/route.ts", "utf8");
const systemMatch = routeSource.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
const SYSTEM = systemMatch[1];

const cases = [
  {
    name: "ROOT: Anthropic停止",
    input: `[質問]\nトランプ政権はなぜAnthropicにAI提供停止を命じた？\n\n[操作] この質問に答える。まず検索して、現在確認できる事実・固有名詞・日付・数値を押さえる。質問の全体像を抽象的にまとめず、中心にある具体的な対象・出来事・制度・技術を名指しする。なぜそれが問題になるのかを、関係者・仕組み・対立軸・制約の流れで説明する。百科事典的な定義だけで終えない。`,
  },
  {
    name: "WHAT: 最先端モデル",
    input: `[親ノード本文 (この中からスパンが選択された)]\n報道では、政府が外国籍の利用者への最先端モデルへのアクセスを止めるよう求め、アンソロピックはそれに従って一部モデルを停止しました。\n\n[選択スパン] "最先端モデル"\n\n[操作] What is it — 親本文の文脈で「最先端モデル」の正体を名指しする。一般的な辞書定義ではなく、親本文での役割を説明する。構成要素、関係者、発生時期、使われる場面、似ているが違う概念のうち少なくとも2つを入れる。親に出ていない固有名詞・数値・制度名・部品名・具体例を必ず足す。`,
  },
  {
    name: "WHY: アクセスを止めるよう求め",
    input: `[親ノード本文 (この中からスパンが選択された)]\n報道では、政府が外国籍の利用者への最先端モデルへのアクセスを止めるよう求め、アンソロピックはそれに従って一部モデルを停止しました。\n\n[選択スパン] "アクセスを止めるよう求め"\n\n[操作] Why is it — 親本文の文脈で、なぜ「アクセスを止めるよう求め」がそうなるのかを掘り下げる。背後にある原因や力学を名指しする。原因、条件、制約、インセンティブ、例外、失敗条件のうち少なくとも3つをつなげて説明する。抽象的な「影響がある」「重要だから」ではなく、誰が・何を・どの条件で・どう変えるのかを書く。`,
  },
];

for (const c of cases) {
  const res = await client.responses.create({
    model: "gpt-5.4-mini",
    instructions: SYSTEM,
    input: c.input,
    tools: [{ type: "web_search" }],
  });
  const searches = res.output.filter((o) => o.type === "web_search_call").length;
  const cost = res.usage.input_tokens * 0.75 / 1e6 + res.usage.output_tokens * 4.5 / 1e6;
  console.log(`\n${"=".repeat(50)}`);
  console.log(`${c.name} | search:${searches} | ¥${(cost * 155).toFixed(2)}`);
  console.log(`${"=".repeat(50)}`);
  console.log(res.output_text);
}
