# Billing flow

Updated: 2026-07-09

## Launch decision

Sondeur launches with a simple subscription flow:

- No anonymous checkout. Users must sign in with email first.
- Free users can start Stripe Checkout for Standard or Pro.
- Paid users cannot start a second Checkout session. They use Stripe Billing Portal for plan changes, payment method updates, and cancellation.
- No trial, annual plan, coupon flow, seat billing, or manual invoicing at launch.
- Stripe webhook state is the source of truth for plan changes.

## User flow

1. Signed-out user logs in or signs up by email magic link.
2. Signed-in Free user opens the account menu and chooses Standard or Pro.
3. The app creates a Stripe Checkout subscription session.
4. On successful payment, Stripe redirects back to `/?billing=success`.
5. The app shows a success notice and refreshes the profile until the webhook-updated plan appears.
6. If the user cancels Checkout, Stripe redirects back to `/?billing=cancel` and the app keeps the user on Free.
7. Paid users see `Manage plan`, which opens Stripe Billing Portal.

## Portal policy

Configure Stripe Billing Portal for:

- Switching between Standard and Pro.
- Updating payment method.
- Canceling at period end, not immediate cancellation, unless support intentionally cancels immediately.
- Returning to the app root URL after portal actions.

The app will keep the current paid plan while a subscription remains active. If Stripe later sends `customer.subscription.deleted`, `unpaid`, or `incomplete_expired`, the app downgrades the profile to Free.

## Failed payments

Configure Stripe Billing failed-payment handling so:

- Stripe retries payment first.
- After retries fail, the subscription is canceled.
- The webhook then receives a terminal subscription state and downgrades the user to Free.

The app intentionally leaves `past_due` unchanged because that state is the retry grace period.

## Test matrix

Before launch, test against live-mode Stripe with a low-risk real card or an internal account:

| Case | Expected result |
| --- | --- |
| Free -> Standard Checkout success | Redirects to `/?billing=success`, notice appears, profile becomes Standard, quota shows `used/100`. |
| Free -> Pro Checkout success | Redirects to `/?billing=success`, notice appears, profile becomes Pro, quota shows `used/300`. |
| Checkout cancel | Redirects to `/?billing=cancel`, notice appears, profile remains Free. |
| Paid user clicks Manage plan | Billing Portal opens; no new Checkout session is created. |
| Standard -> Pro in Portal | Webhook updates profile to Pro. |
| Pro -> Standard in Portal | Webhook updates profile to Standard. |
| Cancel at period end | User keeps paid plan until Stripe sends deletion at period end, then profile becomes Free. |
| Failed payment retries exhausted | Stripe cancels subscription, webhook downgrades profile to Free. |

## Operational checks

- `STRIPE_PRICE_STANDARD` and `STRIPE_PRICE_PRO` must point to live USD prices.
- Webhook endpoint must subscribe to `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
- `STRIPE_WEBHOOK_SECRET` must be set in Vercel production.
- Supabase service key must be set as `SUPABASE_SECRET_KEY` so the webhook can update profiles.
