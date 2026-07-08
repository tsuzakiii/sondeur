# Sondeur pricing model

Updated: 2026-07-08

## Decision

- Free: $0, 20 nodes/month
- Standard: $12/month, 250 nodes/month
- Pro: $24/month, 600 nodes/month

Do not ship an unlimited Pro plan. Search-backed generation has a real per-node cost, and the top plan should stay bounded until production telemetry shows the actual search rate and search-call count.

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
| Standard $12 / 250 | $0.76 | $3.21 | $0.90 | 59.4% |
| Pro $24 / 600 | $1.51 | $7.72 | $0.90 | 57.8% |

Early-scale base case, with only 20 paid users:

| Plan | Stripe fee | OpenAI cost | Fixed infra allocation | Gross margin |
| --- | ---: | ---: | ---: | ---: |
| Standard $12 / 250 | $0.76 | $3.21 | $2.25 | 48.2% |
| Pro $24 / 600 | $1.51 | $7.72 | $2.25 | 52.2% |

Stress case: 100% of paid nodes use web search, every searched node makes 2 web search calls, and fixed infra is allocated across 50 paid users.

| Plan | Stripe fee | OpenAI cost | Fixed infra allocation | Gross margin |
| --- | ---: | ---: | ---: | ---: |
| Standard $12 / 250 | $0.76 | $5.69 | $0.90 | 38.8% |
| Pro $24 / 600 | $1.51 | $13.64 | $0.90 | 33.1% |

Free plan exposure:

- Free user max cost at 20 all-search nodes: about $0.45
- Guest max cost at 10 all-search nodes: about $0.23

If production telemetry shows searched nodes average under 1.2 search calls, Pro can be raised to 800 nodes without changing price. If it stays near 2.0 calls, keep the current caps until there is enough paid-user volume to dilute fixed infra.
