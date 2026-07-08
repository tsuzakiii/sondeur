# Sondeur pricing model

Updated: 2026-07-08

## Decision

- Free: $0, 30 nodes/month
- Standard: $10/month, 300 nodes/month
- Pro: $20/month, 800 nodes/month

Do not ship an unlimited Pro plan. Search-backed generation has a real per-node cost, and the top plan should stay bounded until production telemetry shows the actual search rate.

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

Production-like measurements:

- Search-backed generation: about $0.0125 to $0.0131 per node
- No-search cached generation: about $0.0007 per node
- No-search cold generation: about $0.0023 per node

For planning, use:

- Search node: $0.0130
- No-search node: $0.0015
- Stripe: 6.3% of revenue, assuming a Japan Stripe account, USD billing, JPY settlement, and Billing usage. This is 3.6% card processing + 2.0% currency conversion + 0.7% Billing.
- Fixed infra: $45/month, from Vercel Pro $20/month + Supabase Pro $25/month.

## Gross margin

Formula:

`gross margin = (price - Stripe fee - OpenAI cost - allocated fixed infra) / price`

Assuming 70% of nodes use web search:

| Plan | Paid users | Stripe fee | OpenAI cost | Fixed infra allocation | Gross margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Standard $10 / 300 | 20 | $0.63 | $2.87 | $2.25 | 42.6% |
| Standard $10 / 300 | 50 | $0.63 | $2.87 | $0.90 | 56.1% |
| Standard $10 / 300 | 100 | $0.63 | $2.87 | $0.45 | 60.6% |
| Pro $20 / 800 | 20 | $1.26 | $7.64 | $2.25 | 44.3% |
| Pro $20 / 800 | 50 | $1.26 | $7.64 | $0.90 | 51.0% |
| Pro $20 / 800 | 100 | $1.26 | $7.64 | $0.45 | 53.3% |

Stress case, assuming 100% of paid nodes use web search and 50 paid users:

| Plan | Stripe fee | OpenAI cost | Fixed infra allocation | Gross margin |
| --- | ---: | ---: | ---: | ---: |
| Standard $10 / 300 | $0.63 | $3.90 | $0.90 | 45.7% |
| Pro $20 / 800 | $1.26 | $10.40 | $0.90 | 37.2% |

Free plan exposure:

- Free user max cost at 30 all-search nodes: about $0.39
- Guest max cost at 10 all-search nodes: about $0.13

If free-user activation spikes without conversion, reduce Free from 30 to 20 before reducing paid-plan quotas.
