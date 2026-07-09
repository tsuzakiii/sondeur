# Sondeur

Sondeur is a web app for exploring AI-generated explanations by selecting unclear phrases and expanding them into follow-up nodes.

Live app: https://sondeur.app

| Home | Exploration tree on mobile |
| --- | --- |
| ![Sondeur home screen](docs/screenshot-home.png) | ![Sondeur mobile tree view](docs/screenshot-mobile.png) |

## Product

The core workflow is simple:

1. Ask a question and receive a streamed explanation.
2. Select a phrase in the explanation.
3. Choose `What is it`, `Why is it`, or `Ask`.
4. Sondeur creates a child node with a deeper explanation.
5. The resulting exploration is stored as a tree and can be revisited or shared.

## Current Plans

Pricing is USD-based.

| Plan | Monthly price | Included nodes |
| --- | ---: | ---: |
| Free | $0 | 20/month |
| Standard | $7 | 100/month |
| Pro | $14 | 300/month |

One generated root, follow-up, or free-form answer counts as one node.

## Features

- Span-based follow-up generation with `What`, `Why`, and free-form `Ask`.
- Tree visualization using D3 force simulation.
- Streaming OpenAI Responses API output with optional `web_search`.
- Magic-link auth and cross-device sync through Supabase.
- Guest mode backed by `localStorage`.
- Server-side monthly node quota enforcement.
- Stripe subscription billing.
- Public read-only share links.
- English and Japanese UI/output language support.
- Mobile layout with drawer navigation and bottom-sheet reading panel.

## Production Checklist

These items are not fully handled by the repository and must be completed before a public paid launch:

- Fill the Commercial Disclosure placeholders in `src/app/legal/tokushoho/page.tsx`:
  `【運営者氏名】` twice and `【連絡先メールアドレス】` once.
- Apply all Supabase migrations in order. `0006_guest_quota_grant.sql` is security-critical because it closes leftover `anon` grants.
- Create live Stripe USD prices with `scripts/setup_stripe.mjs`, then set `STRIPE_PRICE_STANDARD` and `STRIPE_PRICE_PRO` in Vercel.
- Confirm Stripe is in live mode, not test mode.
- In Stripe Billing settings, configure failed-payment handling so subscriptions are canceled after retry failure.
- Configure and test the launch billing flow described in `docs/billing-flow.md`.
- Check trademark availability for `Sondeur` in the target launch markets before spending on launch distribution.
- Optional but recommended: set `SENTRY_DSN` and confirm Vercel Analytics is enabled for the production project.

## Architecture

- Next.js 16 App Router with Turbopack.
- React 19.
- Tailwind CSS 4.
- D3 for graph rendering.
- Supabase Auth/Postgres/RLS.
- Stripe Checkout, Billing Portal, and webhooks.
- OpenAI Responses API.
- Sentry hooks that no-op when DSN is unset.
- Vercel hosting.

## Data And Safety Model

- Supabase Row Level Security is enabled for user-owned trees and nodes.
- Monthly quota is consumed server-side through a `SECURITY DEFINER` RPC.
- Guest rate limiting stores a SHA-256 hash of the client IP, not the raw IP.
- Local trees are tagged by owner so data from one signed-in user is not shown to another user on the same browser profile.
- Billing routes fail closed when the profile or Stripe customer state cannot be trusted.
- Shared trees are read-only and can be unshared by the owner.

## Development

```bash
npm install
npm run dev
npm test
npm run typecheck
```

The app falls back to mock streaming when `OPENAI_API_KEY` is not set.

```bash
OPENAI_API_KEY=sk-...
SONDEUR_MODEL=gpt-5.4-mini
```

## Supabase Setup

When Supabase is not configured, the app runs in guest-only `localStorage` mode.

To enable cloud sync:

1. Create a Supabase project.
2. Run every file in `supabase/migrations/` in numeric order.
3. Add the client and service credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
```

4. Configure Supabase Auth URL settings for the deployed domain.

## Stripe Setup

Required environment variables:

```bash
STRIPE_SECRET_KEY=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
STRIPE_PRICE_STANDARD=...
STRIPE_PRICE_PRO=...
STRIPE_WEBHOOK_SECRET=...
```

Create the current USD monthly prices:

```bash
node --env-file=.env.local scripts/setup_stripe.mjs
```

The script currently creates:

- Standard: $7/month, lookup key `sondeur_standard_usd_7_monthly`
- Pro: $14/month, lookup key `sondeur_pro_usd_14_monthly`

The webhook endpoint is `/api/billing/webhook`.

## Cost Measurement

Measure production-like OpenAI cost with encoding checks:

```bash
node --env-file=.env.local scripts/measure_production_cost.mjs
```

The current pricing assumptions and gross-margin model are documented in `docs/pricing-model.md`.

## Project Layout

```text
src/
  app/
    api/expand/        Streaming generation route
    api/billing/       Stripe checkout, portal, and webhook routes
    api/share/         Share/unshare endpoint
    s/[id]/            Public shared-tree page
    legal/             Terms, privacy policy, and commercial disclosure
  components/          GraphView, ReadingPanel, Sidebar, auth UI
  lib/
    store.ts           localStorage-backed tree store
    segments.ts        Span segmentation logic
    planLimits.ts      Plan quota limits
    guestRateLimit.ts  Guest rate limiting
supabase/migrations/   Database schema, RLS, and RPC migrations
docs/                  Screenshots and pricing model
scripts/               Setup, measurement, and operational helpers
```

## License

All rights reserved.
