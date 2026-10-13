# TODO

## リリース残タスク (2026-10-13 更新)
- [x] Stripe live account: charges/payouts enabled、Standard $7 / Pro $14 と本番 webhook を確認済み。既存 endpoint は再作成しない。
- [x] 本番だけに残っていた変更を master + Luna の統合ブランチに取り込み。
- [x] Supabase を再開し、決済ロック用 migration 0007 を適用。
- [ ] 統合版のリリース確認・本番切替 — `docs/release-integration-2026-10-13.md` を参照。
- [ ] live の決済→webhook→プラン更新→Portal解約を確認 (issues/ISSUE-11 の 4)。
- [ ] Supabase Site URL を https://sondeur.app に更新 (owner) → マジックリンクでログイン確認 (Resend SMTP 経由)
- [ ] sondeur.vercel.app → sondeur.app のリダイレクト設定 (owner、Vercel ダッシュボード → Settings → Domains、308)
- [ ] Sentry プロジェクト作成 + `NEXT_PUBLIC_SENTRY_DSN` を Vercel に追加 (owner、任意)
- [ ] Vercel ダッシュボードで Analytics 有効化 (owner、任意)

## プロモ動画 (時期未定, owner作業)
- しっかりしたアニメーション演出はLPでなくプロモ動画側でやる方針 (2026-07-02)

## 完了・却下
- ~~モバイル対応~~ → 2026-07-02 完了 (ドロワー/ボトムシート/タッチ選択。ネイティブアプリ化はしない — iOS IAP強制でStripe課金が壊れるため)
- ~~ホーム画面 What/Why ヒントテキスト~~ → 2026-07-02 不要と判断 (サービスがシンプルなので説明不要)
- ~~独自ドメイン~~ → 2026-07-10 sondeur.app 取得・移行完了 (認証メールの Resend がドメイン必須だったため前倒し)
- ~~特商法プレースホルダ記入~~ → 2026-07-10 完了
