# M1 — webhook returns 200 for unknown Price ID

Closes #4.
Branch: `fix/webhook-unknown-price`
Base: `master`

## Cause

`src/app/api/billing/webhook/route.ts` sets `ok = false` for `checkout.session.completed` and `customer.subscription.updated` events when `planFromPriceId(price.id)` returns `null` (unknown Price ID). The handler then returns 500. Stripe retries the delivery with exponential backoff for up to 3 days in live mode ([Stripe webhooks — automatic retries](https://docs.stripe.com/webhooks#automatic-retries)). Every retry is a wasted round trip that spams Sentry with the same `unknown price id` message, and after 3 days the event is abandoned in the "failed deliveries" queue that only an operator can process manually. The retries never succeed either — a Price ID that is not in `PLAN_PRICE_IDS` will still not be there on the next attempt.

The concrete way this bites: an operator changed the Stripe Price catalog (e.g. the 07-08 pricing pivot from JPY to USD-based lookup keys) and repointed `STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_PRO` to the new IDs. Any existing subscription still on the old Price ID emits `customer.subscription.updated` on any legitimate transition (billing cycle boundary, past_due → active, portal plan change). `planFromPriceId` returns `null`, the handler responds 500, and Stripe never stops retrying that event.

The correct response is to observe the anomaly (log + Sentry, already present in the current code) AND return 200 so Stripe stops retrying immediately, so operators see one message per event and can react to it without waiting through the retry cascade.

## Fix

`src/app/api/billing/webhook/route.ts`:
- On unknown Price ID inside `checkout.session.completed`: leave the `console.error` and `Sentry.captureMessage` calls in place; change `ok = false` to `ok = true` and add a comment stating that retrying will not help because the Price ID catalog will not change under Stripe's foot.
- Same change for the `customer.subscription.updated / status active|trialing` branch.

No handler control-flow change: the `break;` after the log/Sentry still exits the switch, and `ok = true` at the top of the function continues to be the "no work to do" default.

## Acceptance criteria (machine-checkable)

1. **AC-M1-1** — `src/app/api/billing/webhook/route.ts` grep for `Sentry.captureMessage(\`[webhook] unknown price id: ${` returns two hits (checkout completed + subscription updated). Both blocks now assign `ok = true` (not `ok = false`) before the `break;`.
2. **AC-M1-2** — `planFromPriceId("price_unknown")` still returns `null` (regression on `src/lib/__tests__/stripe.test.ts`).
3. **AC-M1-3** — `docs/stripe-vercel-launch-runbook.md` gains a bullet under Stripe: "After changing Price IDs, check Sentry for `unknown price id` messages and manually migrate affected subscribers via the Portal, since the webhook will no longer retry."
4. **AC-INT** — `npm run typecheck` passes, `npm run lint` reports 0 errors and 0 warnings, `npm test` shows all suites green.

## Preregistered failure modes

- **PF1** — a genuinely broken deploy where `STRIPE_PRICE_STANDARD` is unset would cause `planFromPriceId` to return `null` for the legitimate active subscription. Silent 200 masks the misconfiguration. Mitigation: the log + Sentry.captureMessage already fires, so the observability is preserved. `release_check.mjs` should catch missing env in production.
- **PF2** — legitimate deploys occasionally receive events from Stripe test subscriptions or future features whose Price IDs are unknown. Silent 200 is correct for these too. No change needed.

## Out of scope

- Automated migration of subscribers whose Price IDs are unknown (manual portal migration is the operator's step).
- Backfilling a mapping table from old→new Price ID (would require Stripe API round-trips per subscriber; runbook step is enough).

## Blast radius

- Files touched: `src/app/api/billing/webhook/route.ts` (two 1-line changes), `docs/stripe-vercel-launch-runbook.md` (one bullet), `docs/fix-webhook-unknown-price.md` (this spec).
- No dependency added. No API surface change. No new files.

## Platform impact

None. Server-side Route Handler that runs on Vercel Functions (Node runtime). No OS-specific APIs, no filesystem or path semantics, no process/signal APIs, no shell invocation, no platform detection.
