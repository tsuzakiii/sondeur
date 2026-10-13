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
6. Choose `Summarize` to turn the completed branches into a source-linked document, then copy or download it as Markdown.

## Current Plans

Pricing is USD-based.

| Plan | Monthly price | Included nodes |
| --- | ---: | ---: |
| Free | $0 | 20/month |
| Standard | $7 | 100/month |
| Pro | $14 | 300/month |

One generated root, follow-up, free-form answer, or document uses one generation from the allowance. Reopening or downloading an existing document does not generate again.

## Features

- Span-based follow-up generation with `What`, `Why`, and free-form `Ask`.
- Tree visualization using D3 force simulation.
- Streaming OpenAI Responses API output with optional `web_search`.
- Optional Parallel Fast search, with one bounded search request per explanation.
- Documents synthesized from completed branches without additional web searches.
- Magic-link auth and cross-device sync through Supabase.
- Guest mode backed by `localStorage`.
- Server-side monthly node quota enforcement.
- Stripe subscription billing.
- Public read-only share links.
- English and Japanese UI/output language support.
- Mobile layout with drawer navigation and bottom-sheet reading panel.

## Production Checklist

These items are not fully handled by the repository and must be completed before a public paid launch:

- Review the existing operator/contact information in `src/app/legal/tokushoho/page.tsx` (preserved from production).
- Verify all Supabase migrations through `0007` are applied. `0006_guest_quota_grant.sql` closes leftover `anon` grants; `0007_checkout_locks_and_in_flight.sql` is required for checkout concurrency protection.
- Create live Stripe USD prices with `scripts/setup_stripe.mjs`, then set `STRIPE_PRICE_STANDARD` and `STRIPE_PRICE_PRO` in Vercel.
- Confirm Stripe is in live mode, not test mode.
- In Stripe Billing settings, configure failed-payment handling so subscriptions are canceled after retry failure.
- Configure and test the launch billing flow described in `docs/billing-flow.md`.
- Check trademark availability for `Sondeur` in the target launch markets before spending on launch distribution.
- Optional but recommended: set `SENTRY_DSN` and confirm Vercel Analytics is enabled for the production project.

See `docs/release-integration-2026-10-13.md` for the reconciled production source,
verification evidence, and the remaining release gates.

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
Document generation instead returns a configuration error when this key is absent.

```bash
OPENAI_API_KEY=sk-...
SONDEUR_MODEL=gpt-6-luna
```

The default model is `gpt-6-luna`. Explanation generation explicitly uses
`reasoning.effort: "none"` to preserve the previous model's latency baseline;
RSS suggestion generation keeps its existing `low` effort. `SONDEUR_MODEL`
overrides both routes. For production, update any existing Vercel override and
redeploy the verified production source; a repository default change alone does
not change an existing deployment. See `docs/pricing-model.md` for rollout checks.

### Parallel search trial

Set `PARALLEL_API_KEY` as a server-side Vercel Secret and set
`SONDEUR_SEARCH_PROVIDER=parallel` on the same deployment. With this switch,
explanations use the GA Parallel Search API (`/v1/search`, `mode: fast`) followed
by Luna without an OpenAI search tool. Requests time out after 15 seconds and
pass at most 8,000 excerpt characters to the model. Search failures are surfaced;
there is no automatic paid fallback. Omit the switch to retain OpenAI search.

Use Preview first; changing environment variables requires a new deployment.
Do not add either credential under a `NEXT_PUBLIC_` name.

### Exploration documents

Documents use completed, connected branches and preserve source URLs from the
original explanations. They consume one existing generation allowance per
creation/update, with no new search. Input is capped at 200 nodes and 120,000
characters. An interrupted or incomplete response does not replace the previous
document. Later exploration changes mark the saved snapshot as outdated.

Snapshots are local to the device and account-owned tree store, survive a page
reload, and are cleared on sign-out. They are not synced to Supabase or included
in public tree shares. Download Markdown to retain a separate copy. No database
migration is required for this version.

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
