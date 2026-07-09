# Sondeur pricing model

Updated: 2026-07-08

## Decision

- Free: $0, 20 nodes/month
- Standard: $7/month, 100 nodes/month
- Pro: $14/month, 300 nodes/month

Do not ship an unlimited Pro plan. Search-backed generation has a real per-node cost, and the top plan should stay bounded until production telemetry shows the actual search rate and search-call count.

The primary paid plan should stay well below Notion-scale pricing. Sondeur is a focused learning tool, not a broad workspace product, and 200 nodes/month is likely more than many early users will consume.

## Cost assumptions

Sources checked:

- OpenAI API pricing: https://developers.openai.com/api/docs/pricing
- Stripe Japan pricing: https://stripe.com/jp/pricing
- Vercel pricing: https://vercel.com/pricing
- Supabase pricing markdown: https://supabase.com/pricing.md

OpenAI, using `gpt-5.4-mini`:

- Input: $0.375 / 1M tokens
- Cached input: $0.0375 / 1M tokens
- Output: $2.25 / 1M tokens
- Web search: $10 / 1,000 calls

Production-like measurements from `scripts/measure_production_cost.mjs`.
The script reads the production `SYSTEM_PROMPT` from `src/app/api/expand/route.ts` and fails if the generated user prompt contains mojibake markers such as `???` or `�`.

| Case | Input | Cached | Output | Web search calls | Total cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| Concept what, Transformer/self-attention | 5,233 | 0 | 254 | 0 | $0.00253 |
| News why, AI export-control style prompt | 9,548 | 4,736 | 337 | 2 | $0.02274 |

For planning, use:

- No-search node: $0.0015 after cache warmup, with cold runs around $0.0025
- Search node base case: $0.0177, assuming 1.5 web search calls
- Search node stress case: $0.0227, assuming 2 web search calls
- Stripe: 6.3% of revenue, assuming a Japan Stripe account, USD billing, JPY settlement, and Billing usage. This is 3.6% card processing + 2.0% currency conversion + 0.7% Billing.
- Fixed infra: $45/month, from Vercel Pro $20/month + Supabase Pro $25/month.

## Gross margin

Formula:

`gross margin = (price - Stripe fee - OpenAI cost - allocated fixed infra) / price`

Base case: 70% of nodes use web search, searched nodes average 1.5 search calls, and fixed infra is allocated across 50 paid users.

| Plan | Stripe fee | OpenAI cost | Fixed infra allocation | Gross margin |
| --- | ---: | ---: | ---: | ---: |
| Standard $7 / 100 | $0.44 | $1.28 | $0.90 | 62.5% |
| Pro $14 / 300 | $0.88 | $3.85 | $0.90 | 59.8% |

Early-scale base case, with only 20 paid users:

| Plan | Stripe fee | OpenAI cost | Fixed infra allocation | Gross margin |
| --- | ---: | ---: | ---: | ---: |
| Standard $7 / 100 | $0.44 | $1.28 | $2.25 | 43.2% |
| Pro $14 / 300 | $0.88 | $3.85 | $2.25 | 50.1% |

Stress case: 100% of paid nodes use web search, every searched node makes 2 web search calls, and fixed infra is allocated across 50 paid users.

| Plan | Stripe fee | OpenAI cost | Fixed infra allocation | Gross margin |
| --- | ---: | ---: | ---: | ---: |
| Standard $7 / 100 | $0.44 | $2.27 | $0.90 | 48.4% |
| Pro $14 / 300 | $0.88 | $6.82 | $0.90 | 38.5% |

Free plan exposure (per user, per period — the enforcement layer determines the period):

- **Free (signed-in) user, monthly**: capped at 20 nodes/month by the `consume_node_quota` RPC (`supabase/migrations/0002_node_quota.sql`) which is enforced server-side against `PLAN_NODE_LIMITS.free = 20` in `src/lib/planLimits.ts`. Worst case at 20 all-search nodes: about $0.45. The counter resets on each new `month_key`.
- **Guest, per-IP per-day**: the server-side hard limit is `DAILY_LIMIT = 15` in `src/lib/guestRateLimit.ts`, enforced by the `consume_guest_quota(p_ip_hash, p_limit)` RPC from `supabase/migrations/0005_guest_rate_limit.sql`. The counter is keyed by SHA-256 of the client IP and a `day date` column, so it **resets every calendar day**. Worst case at 15 all-search nodes per day: about $0.34/day per IP, recurring — not a one-shot ceiling.
- `GUEST_NODE_LIMIT = 10` in `src/lib/planLimits.ts` is a **client-side friction check** consumed by `src/app/page.tsx`. It reads `totalNodes` from localStorage and gates the UI, but a determined user can bypass it by clearing localStorage or switching browser profiles. The 15-per-day server-side RPC is the actual bound.

If production telemetry shows searched nodes average under 1.2 search calls, Pro can be raised to 500 nodes without changing price. If it stays near 2.0 calls, keep the current caps until there is enough paid-user volume to dilute fixed infra.
