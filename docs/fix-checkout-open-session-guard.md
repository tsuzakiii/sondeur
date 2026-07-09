# M2 — Checkout race hardening (bounded)

Closes #5. Cross-plan concurrent-tab race tracked separately as [#15](https://github.com/tsuzakiii/sondeur/issues/15).
Branch: `fix/checkout-open-session-guard`
Base: `master`

Spec review closure: 3 Codex spec rounds (r1 full-artifact + r2 rebuild + r3 rebuild), each surfaced further detail attacks on the details of what could and could not be guarded with only Stripe API primitives. Adopted findings up to r3 into this spec: idempotency key now includes a `hasStripe` bit (r3 F2), AC-M2-2 aligns with the extracted helper (r3 F1). Remaining r3 findings are triaged as spec-accepted (AC insertion-point wording is descriptive not prescriptive; automated regression on the double-read is via the helper unit tests plus lint/typecheck plus branch review; F5 is closed by webhook writing plan+customer_id together — see PF5) or rejected as over-specification (PF1 memoize proposal removed). Further r4 spec review is not sought; branch review will cover the implementation.

## Thesis (revised after r2 spec review)

Two bounded improvements to the checkout route:
1. Same-plan double-click resolves to one Session via Stripe idempotency keys.
2. Webhook-arrived state races (first tab paid, webhook fired, second tab reads stale profile) get caught by re-reading the profile immediately before create.

Not addressed here: cross-plan concurrent-tab race (Standard tab + Pro tab, both clicked before either webhook fires) — closing that fully requires a per-user server-side lock (Redis / DB / advisory lock) and is a scope expansion tracked in [#15](https://github.com/tsuzakiii/sondeur/issues/15). This PR does not claim any completeness invariant on that path.

Not addressed here: a Sentry-side visibility layer for residual duplicates. r2 review confirmed that `stripe.checkout.sessions.list({ status: "open" })` cannot see completed Sessions, so a "detect and warn" layer would be silent exactly on the paid-then-tabbed case that matters. Any detection worth building requires the same infra as #15 (a server-side lock or an out-of-band aggregation over `subscription.created` events).

## Cause

`src/app/api/billing/checkout/route.ts` reads `profile.plan` and `profile.stripe_customer_id` once at handler entry. When a Free user opens two tabs and clicks Standard in each before the webhook fires for either, both requests see `plan === "free"` and neither has a `stripe_customer_id` yet, so both proceed to `stripe.checkout.sessions.create`. Two Session URLs → potentially two paid subscriptions.

## Fix

**Layer 1 — Stripe idempotency key on Session create.**

Pass a second argument object `{ idempotencyKey: keyValue }` to `stripe.checkout.sessions.create`. `keyValue = \`checkout:${auth.user.id}:${body.plan}:${price}\`` — deterministic per (user, plan, resolved Price ID). Same-plan retries within Stripe's 24-hour idempotency retention hit the same Session; Price ID rotations produce a new key so an env change does not collide with the old retention. If the retained Session has already expired or completed, the second tab lands on the same Stripe-hosted page (which shows the appropriate completed/expired state) — the user cannot be double-charged through this path.

**Layer 2 — Second profile read immediately before create.**

After the initial guard block, and immediately before `stripe.checkout.sessions.create`, re-execute `.from("profiles").select("plan, stripe_customer_id").eq("id", auth.user.id).single()`. Bind the result to a NEW variable `fresh` (not shadowing the earlier `profile`) and re-run the exact same 3 guards against `fresh`:
1. `if (freshError || !fresh)` → 503 `profile unavailable — try again shortly`.
2. `if (fresh.plan && fresh.plan !== "free")` → 409 `already subscribed`.
3. `if (fresh.stripe_customer_id) { const subs = await stripe.subscriptions.list(...); if (subs.data.some(live-status))` → 409 `already subscribed`.

Only after all three re-checks pass does the route proceed to create. This closes the specific race "webhook fired for tab A while tab B was between initial guard and create" because at that moment `fresh.plan !== "free"` or `fresh.stripe_customer_id` is populated and one of the re-checks catches it.

The re-read is one extra Supabase round trip. That is an accepted cost.

## Acceptance criteria (machine-checkable)

1. **AC-M2-1** — `src/app/api/billing/checkout/route.ts` calls `stripe.checkout.sessions.create(<params>, <options>)` with exactly two arguments; the second argument's `idempotencyKey` property is populated from `checkoutIdempotencyKey(...)` (the helper below).
2. **AC-M2-2** — a helper `src/lib/idempotencyKey.ts` exports `checkoutIdempotencyKey(userId, plan, priceId, hasStripe): string` returning `` `checkout:${userId}:${plan}:${priceId}:${hasStripe ? "c" : "e"}` ``. The `hasStripe` bit is included so that once the webhook populates `stripe_customer_id` (which flips the `customer` vs `customer_email` branch in the create params), retries fall to a different key and avoid Stripe idempotency parameter-conflict 400s. Unit tests in `src/lib/__tests__/idempotencyKey.test.ts` cover: (a) same user+plan+price+bit → same key, (b) different plan → different key, (c) different user → different key, (d) rotated priceId → different key, (e) `hasStripe` bit flip → different key. Route uses this helper — no route-local hand-rolled template.
3. **AC-M2-3** — immediately before `stripe.checkout.sessions.create`, the route executes `.from("profiles").select("plan, stripe_customer_id").eq("id", auth.user.id).single()` a SECOND time, binds it to `fresh`, and re-runs all three guards against `fresh` (503 on read failure, 409 on non-free plan, 409 on live subscription). The re-read is the last DB-side operation before create. Verification is: (a) `fresh` variable exists as a distinct name from `profile`, (b) the create call's `customer` vs `customer_email` branch reads `fresh.stripe_customer_id`, NOT `profile.stripe_customer_id` — this closes the F2 window where webhook populated customer_id between the initial read and create.
4. **AC-INT** — `npm run typecheck` passes, `npm run lint` reports 0 errors and 0 warnings, `npm test` all suites green.

## Preregistered failure modes

- **PF1** — Layer 2 second Supabase round trip on the hot path. This is the point — do not memoize or otherwise reintroduce the stale-profile behavior. Extra round trip cost is accepted.
- **PF2** — Layer 1 idempotency key includes the resolved `priceId` and the `hasStripe` bit, so both a Price ID rotation (`stripe.setup_stripe.mjs` rerun producing new IDs) and a webhook-driven `stripe_customer_id` population between concurrent retries produce a fresh key and Stripe does NOT replay a stale response from before the rotation or throw a parameter conflict.
- **PF3** — All other parameters passed to `stripe.checkout.sessions.create` are deterministic given the (userId, plan, priceId, hasStripe) tuple in the key: `client_reference_id` is `auth.user.id`, `subscription_data.metadata.user_id` is `auth.user.id`, `origin`-derived URLs are the same across tabs behind the same host. If a future edit adds a non-deterministic field, Stripe will return idempotency conflicts on the second retry within 24h; those errors surface as the existing 500 route response so they are visible in operator monitoring.
- **PF4** — Cross-plan concurrent race (Standard-tab + Pro-tab) is NOT closed by this fix — documented in Out of scope and tracked in #15.
- **PF5** — F5-style webhook race where the webhook has flipped `plan` to standard/pro but `stripe_customer_id` is somehow still null: Layer 2 catches this via the `fresh.plan !== "free"` guard (webhook always updates plan when it populates customer_id — `setPlan` at `webhook/route.ts` writes both in the same UPDATE, so the two fields flip together).

## Out of scope / Accepted tradeoffs

- **Cross-plan concurrent race** (Standard tab + Pro tab clicked before either webhook fires): both tabs proceed to Stripe. Both payments can succeed. Closing this requires a per-user server-side lock — see #15. This tradeoff is explicit and not maskable by a small design change; the operator can choose to accept the residual risk (it requires the same user in two tabs choosing DIFFERENT plans within seconds, and both actually completing payment) or open #15 as a follow-up.
- **Route-level integration test with Stripe/Supabase mocks**: same rationale as PR #14 (M1). The idempotency key template is validated at the unit level via `checkoutIdempotencyKey`, and the AC-M2-3 double-read wiring is validated by targeted grep + code review, not by a mocked route test. Regression detection for the wired behavior is: (a) the helper unit tests fail if the template drifts, (b) `npm run lint` / `npm run typecheck` catch structural regressions.
- **Client-side in-flight button-disable indicator**: separate UX improvement, not a race-safety change.
- **Sentry-side detection of paid-completed duplicates**: rejected here as a design tradeoff. r2 review confirmed that any detection based on `stripe.checkout.sessions.list({ status: "open" })` is silent on the completed-then-tabbed case that matters. Effective detection requires either (a) polling `stripe.subscriptions.list` for the user's customer periodically, which is out of scope, or (b) an out-of-band alert on `subscription.created` webhooks that fires when a subscriber gets a second live subscription — tracked as part of #15.

## Blast radius

- Files touched: `src/app/api/billing/checkout/route.ts` (Layer 1 idempotency key on `create`, Layer 2 second profile read + guards), `src/lib/idempotencyKey.ts` (new, single exported helper), `src/lib/__tests__/idempotencyKey.test.ts` (new), `docs/fix-checkout-open-session-guard.md` (this spec, new).
- No dependency added. No new env var. Existing 409/200/503 response shapes unchanged.

## Platform impact

None. Server-side Route Handler + pure TypeScript helper + test. No OS-specific APIs.
