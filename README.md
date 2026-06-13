# Sondeur

AIの説明の「わからない箇所」をスパン選択し、**What is it**（それは何か）/ **Why is it**（なぜそうなのか）の二択で掘り下げる学習サービス。掘った履歴は木構造として蓄積され、理解の航跡＝資産になる。

## 起動

```bash
npm install
npm run dev
```

LLM応答を有効にするには `.env.local` に以下を設定（未設定時はモックストリーミングで動作）:

```
OPENAI_API_KEY=sk-...
SONDEUR_MODEL=gpt-5.4-mini   # 省略可、デフォルト gpt-5.4-mini
```

## クラウド同期 (Supabase) のセットアップ

未設定の間はゲストモード（localStorage のみ）で動く。有効化する手順:

1. [supabase.com](https://supabase.com) でプロジェクト作成（無料枠でOK、リージョンは Tokyo 推奨）
2. ダッシュボード → SQL Editor で `supabase/migrations/0001_init.sql` の中身を実行
3. Settings → API から URL と anon key を `.env.local` に追記:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
4. Authentication → URL Configuration の Site URL に `http://localhost:3000`（開発時は使用ポート）を設定
5. devサーバー再起動 → サイドバー下部に「ログインして航跡をクラウドに保存」が出る

ログインはメールのマジックリンク。初回ログイン時、ゲスト時代のローカルツリーは自動でクラウドへ移行される。ノードは追記のみの設計なので、同期は「作成時insert + 生成完了時のcontent確定」だけで成立する。

## 使い方

1. 下部の入力バーから質問 → 新規ツリーが作成されルートノードに説明がストリーミングされる
2. リーディングパネルの本文をドラッグでスパン選択 → フローティングピルから **What is it** / **Why is it**
3. グラフに新ノードが生え、本文が埋まる（生成中はパルス）
4. 掘り済みスパンは本文中にハイライトされ、クリックで既存子ノードへジャンプ（再生成しない）
5. ノードクリックで本文表示、ダブルクリックでサブツリーを折りたたみ（`+N` バッジ）

## エッジの意味づけ

- **What** = シアン・実線（定義に降りる）
- **Why** = アンバー・破線（理由に登る）

## 現状の実装範囲

- コアループ: ツリー作成 / スパン選択 / What・Why・自由質問展開 / D3 force グラフ / 折りたたみ
- LLM: Responses API + web_search（モデル判断で検索）、reasoning effort low、事実性規律プロンプト
- ホームのサジェスト: 当日のニュースから生成（`/api/suggestions`、日次キャッシュ、失敗時は静的フォールバック）
- 永続化: ゲスト = localStorage / ログイン = Supabase 同期（マジックリンク認証、RLS、初回ログインでローカル分を自動移行）
- 未実装: Free プラン制限（5ツリー/月・深さ3）、Stripe 課金、ツリー横断検索、共有/エクスポート、モバイル最適化
- 既知の制限: ゲストの localStorage は**シングルタブ前提**（複数タブ同時編集で上書きが起きる）

## 構成

- `src/lib/types.ts` — Tree / SondeurNode / ExpandRequest 型
- `src/lib/store.ts` — localStorage 永続化ストア（useSyncExternalStore）。Supabase 移行時はこのモジュールを差し替える
- `src/lib/expand.ts` — ツリー作成・スパン展開のクライアント側オーケストレーション（fetch ストリームをストアへ流し込む）
- `src/app/api/expand/route.ts` — ストリーミング Route Handler。`OPENAI_API_KEY` 未設定時はモック
- `src/components/GraphView.tsx` — D3 force simulation（ズーム/パン/ドラッグ/折りたたみ）
- `src/components/ReadingPanel.tsx` — スパン選択 → ピル、掘り済みハイライト
