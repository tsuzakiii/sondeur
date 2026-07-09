# M1 — webhook returns 200 for unknown Price ID

Closes #4.
Branch: `fix/webhook-unknown-price`
Base: `master`

## Cause

`src/app/api/billing/webhook/route.ts` sets `ok = false` for `checkout.session.completed` and `customer.subscription.updated` events when `planFromPriceId(price.id)` returns `null` (unknown Price ID). The handler then returns 500. Stripe retries the delivery with exponential backoff for up to 3 days in live mode ([Stripe webhooks — automatic retries](https://docs.stripe.com/webhooks#automatic-retries)). Every retry is a wasted round trip that spams Sentry with the same `unknown price id` message, and after 3 days the event is abandoned in the "failed deliveries" queue that only an operator can process manually. The retries never succeed either — a Price ID that is not in `PLAN_PRICE_IDS` will still not be there on the next attempt.

The concrete way this bites: an operator changed the Stripe Price catalog (e.g. the 07-08 pricing pivot from JPY to USD-based lookup keys) and repointed `STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_PRO` to the new IDs. Any existing subscription still on the old Price ID emits `customer.subscription.updated` on any legitimate transition (billing cycle boundary, past_due → active, portal plan change). `planFromPriceId` returns `null`, the handler responds 500, and Stripe never stops retrying that event.

The correct response is to observe the anomaly (log + Sentry with subscription/customer/user context so the operator can identify which subscriber to migrate) AND return 200 so Stripe stops retrying immediately.

`planFromPriceId` reads `STRIPE_PRICE_STANDARD` and `STRIPE_PRICE_PRO` from env; when those env vars are re-pointed to new Price IDs, existing subscriptions on the old IDs no longer match either constant and `planFromPriceId` returns `null`.

## Fix

`src/app/api/billing/webhook/route.ts`:
- On unknown Price ID inside `checkout.session.completed`: log + `Sentry.captureMessage(msg, "warning")` (level explicit so production alert rules that fire on `warning`+ or `error` are triggered), where `msg` includes `sub.id`, `customer` id, and `user` id — the operator needs those to find the affected subscriber. Then, if a `customerId` is present, call the new `setCustomerIdOnly(userId, customerId)` helper to persist just the `stripe_customer_id` on the profile without changing `plan`. This preserves the checkout route's live-subscription guard (which uses `stripe_customer_id`) so the same user cannot be pushed into a second Stripe subscription. Break out of the switch; the top-of-function `ok = true` default holds so the handler responds 200.
- On unknown Price ID inside `customer.subscription.updated / status active|trialing`: same log + Sentry level, message includes `sub.id` and `customer` id. `stripe_customer_id` is already persisted (checkout.completed populated it earlier in the subscription lifecycle), so no helper call is needed. `ok = true`, break.

New helper `setCustomerIdOnly(userId, customerId): Promise<boolean>` in the same file. It mirrors the shape of `setPlan` but updates only `stripe_customer_id`. Same error paths (Sentry capture on failure, log on missing profile row).

## Acceptance criteria (machine-checkable)

1. **AC-M1-1** — `src/app/api/billing/webhook/route.ts` grep for `Sentry.captureMessage(msg, "warning")` returns at least two hits (checkout completed + subscription updated). Neither unknown-price branch assigns `ok = false`.
2. **AC-M1-2** — the Sentry messages emitted from the unknown-price branches include `sub.id` and `customer` context (grep for `sub=${sub.id}` in `route.ts`).
3. **AC-M1-3** — the checkout unknown-price branch calls `setCustomerIdOnly(userId, customerId)` when `customerId` is available (grep for `setCustomerIdOnly` in `route.ts`), so the profile's `stripe_customer_id` is populated even when the plan cannot be inferred.
4. **AC-M1-4** — `planFromPriceId("price_unknown")` still returns `null` (regression via `src/lib/__tests__/stripe.test.ts`).
5. **AC-M1-5** — `docs/stripe-vercel-launch-runbook.md` gains a bullet noting: after Price ID rotation, unknown-price webhooks return 200 on purpose, watch Sentry `warning`+ level for the messages, and migrate the affected subscribers manually via Portal or `stripe.subscriptions.update`.
6. **AC-INT** — `npm run typecheck` passes, `npm run lint` reports 0 errors and 0 warnings, `npm test` shows all suites green.

## Preregistered failure modes

- **PF1** — a genuinely broken deploy where `STRIPE_PRICE_STANDARD` is unset would cause `planFromPriceId` to return `null` for the legitimate active subscription. Silent 200 masks the misconfiguration. Mitigation: the log + Sentry.captureMessage already fires, so the observability is preserved. `release_check.mjs` should catch missing env in production.
- **PF2** — legitimate deploys occasionally receive events from Stripe test subscriptions or future features whose Price IDs are unknown. Silent 200 is correct for these too. No change needed.

## Out of scope

- Automated migration of subscribers whose Price IDs are unknown (manual portal migration is the operator's step).
- Backfilling a mapping table from old→new Price ID (would require Stripe API round-trips per subscriber; runbook step is enough).
- **Route-level integration test for the webhook handler** — verifying the `ok = true` / `setCustomerIdOnly` control flow with Stripe SDK + Supabase mocks is a scope expansion (both dependencies would need harnessed in the vitest setup). The existing `planFromPriceId` unit test in `stripe.test.ts` covers the specific classification (`price_unknown` → `null`) that gates the unknown-price branch. Regression detection for the handler-level behavior is via Sentry `warning` capture: the operator sees any change that removes or breaks the emit, and CI-level `lint`/`typecheck` catches the routine breakage. If a follow-up wants a route-level test, factor the switch bodies into pure helper functions first.

## Blast radius

- Files touched: `src/app/api/billing/webhook/route.ts` (unknown-price branches rewritten to `ok = true`, message enriched with sub/customer/user context, level set to `warning`; new `setCustomerIdOnly` helper), `docs/stripe-vercel-launch-runbook.md` (one bullet), `docs/fix-webhook-unknown-price.md` (this spec, new).
- No dependency added. No API surface change.

## Platform impact

None. Server-side Route Handler that runs on Vercel Functions (Node runtime). No OS-specific APIs, no filesystem or path semantics, no process/signal APIs, no shell invocation, no platform detection.
