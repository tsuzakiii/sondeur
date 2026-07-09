# Stripe and Vercel Launch Runbook

## Stripe

- Confirm `STRIPE_SECRET_KEY` starts with `sk_live_`.
- Confirm `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` starts with `pk_live_`.
- Confirm `STRIPE_PRICE_STANDARD` is the live USD monthly Price ID for Standard at `$7/month`.
- Confirm `STRIPE_PRICE_PRO` is the live USD monthly Price ID for Pro at `$14/month`.
- In Billing settings, set failed-payment handling so that retries eventually cancel the subscription.
- In the customer portal, allow plan changes, payment method updates, and cancellation.
- Configure the production webhook endpoint for:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Confirm the webhook signing secret is set as `STRIPE_WEBHOOK_SECRET`.

## Vercel

- Set `NEXT_PUBLIC_SITE_URL` to the production URL.
- Set all Supabase, OpenAI, Stripe, and optional Sentry environment variables in Production.
- Enable Vercel Analytics and Speed Insights for the production project.
- Run `npm run release:check` locally with production-equivalent environment variables before deployment.
- After deployment, run one live Checkout for Standard, then cancel from the Billing Portal and confirm the profile remains paid until Stripe sends the terminal subscription event.

## Supabase

- Apply migrations `0001` through `0006` in order.
- Run `docs/supabase-production-check.sql` in the production SQL Editor.
- Confirm `consume_guest_quota` and `cleanup_guest_usage` are executable by `service_role` only.
