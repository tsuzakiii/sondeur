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

Additional integration fixes: auth redirects use private/no-store caching; webhook setup refuses to delete an existing endpoint; release documentation requires migration 0007.

## Validation and infrastructure

- TypeScript, ESLint, 114 tests (18 files), and the production Next.js build passed.
- Added regression coverage for token-hash and PKCE callbacks, session cookies, expired/missing links, all four expansion operations, English/model overrides, quota rejection before a paid call, and provider-stream errors.
- Local browser: root generation streamed through the API into a node; no browser errors. This test used the built-in mock, not a live model.
- Vercel Production has the required variable names; values are sensitive and were not read. No `SONDEUR_MODEL` override exists, so a new deployment uses Luna by default. Presence does not prove credential validity.
- Public production bundles identify Supabase `jlqzeuahcrhogqufbhvw`, confirming the database target.
- That project was resumed from INACTIVE to ACTIVE_HEALTHY. Existing profiles/trees/nodes/guest_usage have RLS; quota functions exist, and guest quota RPCs exclude anon/authenticated/PUBLIC.
- Migration 0007 was applied as `checkout_locks_and_in_flight`. Verified lock table, RLS/deny policy, both RPCs, service-only table access, all four service table privileges, and nullable in-flight session column. Both RPCs grant EXECUTE only to postgres/service_role.
- Previous migrations were applied without Management API migration-history entries. Inspect schema and grants before attempting to replay old migrations; an empty history does not mean an empty database.

## Remaining gates before production promotion

1. Complete the live Luna preview smoke test (Japanese/English, root/what/why/ask, streaming and RSS suggestions). Restore the temporary OpenAI environment scope and delete the test deployment afterward.
2. Verify production credential values using the deployed runtime / owner dashboard; `npm run release:check` validates format/presence, not account access. Never copy production secrets into the repository or logs.
3. Verify magic-link login and live billing → webhook → profile → Portal cancellation using an owner-controlled account. Preview does not receive production Supabase or Stripe credentials.
4. Merge the reviewed integration PR with a merge commit, verify the resulting SHA, and stage that exact production build without assigning domains before promotion. Retain the old deployment ID above for rollback. A normal `master` deployment before integration would lose production-only features.

The current tools can read the project's default scope but explicit team-scoped calls return 403. Do not change accounts merely to work around this. For CLI deployment, verify login/team/project first and use `vercel --prod --skip-domain`; this document does not assert CLI authentication is already configured.

## Existing advisor findings

Supabase reports client-callable SECURITY DEFINER routines (`consume_node_quota`, `update_locale`, and two trigger functions), an RLS table without client policies (`guest_usage`, intentionally service-only), and disabled leaked-password protection (the app uses email links). These are existing findings outside the added checkout migration; review separately before a broader security sign-off. The user-scoped routines use `auth.uid()`; this integration does not grant additional client access.

- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
