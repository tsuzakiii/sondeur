# Production / master integration, 2026-10-13

## Source of truth

- Vercel project: `prj_pNXebpVJ6jweFQQuWIe8m2r5di3y` (`sondeur`).
- Existing production deployment: `dpl_5MwvpQMuBz37pTkbHNEmp45HFb57`.
- Its CLI metadata identifies `agent/release-readiness` at `4a103621e9d6ddb2e8ee920a626f9974528c0012`.
- Fetched master: `9b359fce19fb8070f560a4f435ac78936c7cb28a`.
- Production and master diverged by 9 and 27 commits respectively. Both histories are merged into `codex/gpt-6-luna` / PR #20; do not squash away the integration ancestry when merging.
- Of 95 source entries exposed by Vercel's truncated file listing, 93 tracked files matched the recorded production commit: 58 byte-for-byte and 35 after LF/CRLF normalization. The other two were generated `next-env.d.ts` and `tsconfig.tsbuildinfo`. Deeper paths were omitted by the connector; this is not a claim of a complete deployed-file audit.

## Preserved behavior

Production: sonar icons/OG image, sondeur.app canonical URLs, filled commercial disclosure, token-hash/PKCE email callback, localized auth failure notice, guest trial counter, clickable footer behind the blank input bar, share failure feedback, and exclusion of fallback suggestions from the browser cache.

Master: cross-user tree/profile isolation, checkout locking and in-flight tracking, duplicate-session guard, unpaid customer Portal access, unknown-price webhook handling, billing polling cleanup, and graph cycle/geometry fixes.

Luna: expansion defaults to `gpt-6-luna` with explicit `none` reasoning; RSS suggestions retain `low`. `SONDEUR_MODEL` remains a rollback override. External search-provider migration is not included.

Additional integration fixes: auth redirects use private/no-store caching; webhook setup refuses to delete an existing endpoint; release documentation requires migration 0007. NHK RSS URLs now use the current news.web.nhk endpoint; individual fetch failures are logged while successful categories remain usable. Tests cover RSS outage recovery, partial failures, and provider recovery without caching fallback results.

## Validation and infrastructure

- TypeScript, ESLint, 117 tests (19 files), and the production Next.js build passed.
- Added regression coverage for token-hash and PKCE callbacks, session cookies, expired/missing links, all four expansion operations, English/model overrides, quota rejection before a paid call, and provider-stream errors.
- Local browser: root generation streamed through the API into a node; no browser errors. This test used the built-in mock, not a live model.
- Vercel Production has the required variable names; values are sensitive and were not read. No `SONDEUR_MODEL` override exists, so a new deployment uses Luna by default. Presence does not prove credential validity.
- Public production bundles identify Supabase `jlqzeuahcrhogqufbhvw`, confirming the database target.
- That project was resumed from INACTIVE to ACTIVE_HEALTHY. Existing profiles/trees/nodes/guest_usage have RLS; quota functions exist, and guest quota RPCs exclude anon/authenticated/PUBLIC.
- Migration 0007 was applied as `checkout_locks_and_in_flight`. Verified lock table, RLS/deny policy, both RPCs, service-only table access, all four service table privileges, and nullable in-flight session column. Both RPCs grant EXECUTE only to postgres/service_role.
- A database transaction verified acquisition, contention rejection, wrong-token rejection, release, and reacquisition. The transaction was rolled back without persistent test rows.
- Previous migrations were applied without Management API migration-history entries. Inspect schema and grants before attempting to replay old migrations; an empty history does not mean an empty database.

## Remaining gates before production promotion

1. Verify production Supabase and Stripe credentials using the deployed runtime / owner dashboard; `npm run release:check` validates format/presence, not account access. Never copy production secrets into the repository or logs.
2. Verify magic-link login and live billing → webhook → profile → Portal cancellation using an owner-controlled account. Preview does not receive production Supabase or Stripe credentials.
3. Merge the reviewed integration PR with a merge commit, verify the resulting SHA, and stage that exact production build without assigning domains before promotion. Retain the old deployment ID above for rollback. A normal `master` deployment before integration would lose production-only features.

### Live Preview verification and cleanup

Vercel CLI 63.1.2 authenticated successfully as `matsuzaki1005-7063` in `matsuzaki1005-7063s-projects`. The earlier device code was no longer usable; the renewed login completed. Explicit team-scoped connector calls still return 403, but the authenticated CLI can deploy, inspect, test, and delete previews.

The Git-source previews `dpl_FumkQY6PSSbY8wQ1HPacend4frMc` and `dpl_B8K2e5cPCFZDLScnzxPW91mJ1hkJ` failed with `git_info_fail` before building and were deleted. CLI source uploads built successfully:

- `dpl_A5SYokmKKDsyuEmFHVtcEFQieBR6`, source `af5793c`: real OpenAI streaming succeeded for root/JA (11.81s), what/EN (8.89s), why/JA (6.27s), and ask/EN (6.05s). All returned HTTP 200 and non-mock answers with source links. These are four samples, not a latency benchmark or a full language/operation matrix.
- That first preview exposed an RSS failure (`no headlines`); the model was not called for suggestions. Both old and current NHK endpoints were reachable locally, so this was not a universal outage of the old URL.
- `dpl_DaQJUQzKem5xaxw39dZeog4hnMEN`, source `364f5dc`: Vercel production build passed after updating RSS URLs. Real suggestions returned HTTP 200, three questions, and `source: rss+llm` in Japanese (5.81s) and English (5.68s). The generation used Luna with low reasoning and no paid search tool.

The owner authorized temporary reuse of the Production OpenAI key and a small amount of API usage. Its value was never read or printed. The environment scope was restored to Production-only immediately after each preview was created. All four test/failed preview records above have been deleted. The automation bypass generated by `vercel curl` was revoked by its exact creation timestamp and owner; zero project bypass tokens remain, and Vercel Authentication remains `all_except_custom_domains`.

Production is still `dpl_5MwvpQMuBz37pTkbHNEmp45HFb57`; no production promotion occurred. For the release, verify login/team/project and stage with `vercel --prod --skip-domain` before assigning domains. Preview validation did not include production Supabase/Stripe credentials, real magic-link delivery, payment processing, or measured provider token/tool usage costs.

## Existing advisor findings

Supabase reports client-callable SECURITY DEFINER routines (`consume_node_quota`, `update_locale`, and two trigger functions), an RLS table without client policies (`guest_usage`, intentionally service-only), and disabled leaked-password protection (the app uses email links). These are existing findings outside the added checkout migration; review separately before a broader security sign-off. The user-scoped routines use `auth.uid()`; this integration does not grant additional client access.

- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
