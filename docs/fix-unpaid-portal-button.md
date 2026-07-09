# M3 — surface Portal button for Free users who still have a Stripe customer id

Closes #6.
Branch: `fix/unpaid-portal-button`
Base: `master`

## Cause

`src/components/AuthFooter.tsx` branches the plan bar UI on `plan === "free"` alone:
- `plan === "free"` → Upgrade / Standard / Pro buttons (no Portal button).
- `plan !== "free"` → Manage plan → Portal.

The webhook at `src/app/api/billing/webhook/route.ts` downgrades a subscription to `plan: "free"` when Stripe reports `status: "canceled" | "unpaid" | "incomplete_expired"`. The row keeps `stripe_customer_id` populated because nothing clears it. So a Standard user whose payment finally fails (Stripe retries exhausted) lands in `{ plan: "free", stripe_customer_id: <cus_...> }`. The UI reads only `plan`, shows the free flow, and offers Upgrade. Clicking Upgrade calls `/api/billing/checkout` which finds a still-live subscription (`unpaid` is in the live-status set) and returns 409. The user has no way to reach the Portal from the UI to fix the card and reactivate.

## Fix

Split the "free" branch by `hasStripe`. `plan === "free" && hasStripe` (a previously-paying user whose subscription was downgraded by webhook) shows the Portal button labelled with a payment-recovery string. `plan === "free" && !hasStripe` (a brand-new Free user) keeps the current Upgrade UI.

Concretely:

- `src/components/AuthFooter.tsx`:
  - Compute a local `mode` (union): `"upgrade" | "recover" | "manage"`.
    - `plan === "free" && !hasStripe` → `"upgrade"`.
    - `plan === "free" && hasStripe` → `"recover"`.
    - `plan !== "free"` → `"manage"`.
  - `"upgrade"`: existing Upgrade button + Standard/Pro cards. Unchanged.
  - `"recover"`: single button labelled with a new i18n key `auth.updatePayment` (en: "Update payment method", ja: "支払い方法を更新"). Clicks call `goBilling("portal", t)`.
  - `"manage"`: existing Manage plan button. Unchanged.
- `src/lib/i18n.tsx`: add `auth.updatePayment` in en and ja.

## Acceptance criteria (machine-checkable)

1. **AC-M3-1** — `src/components/AuthFooter.tsx` computes a `mode` value that is `"recover"` iff `(plan === "free" || plan == null) && displayProfile?.hasStripe === true`. The `plan == null` inclusion is deliberate: a signed-in user with `hasStripe === true` but no plan value yet (initial mount before the polling loop resolves) is almost certainly a returning subscriber whose row is populated; routing them to Portal is the safer default than showing Upgrade + risking a 409 on click. Verify by targeted read of the render function.
2. **AC-M3-2** — the `recover` branch renders exactly one button that calls `goBilling("portal", t)` and its label reads `t("auth.updatePayment")`.
3. **AC-M3-3** — the `upgrade` branch's condition is `plan === "free" && !hasStripe` (not simply `plan === "free"`). New Free users (`hasStripe === false`) still see Standard / Pro Upgrade cards.
4. **AC-M3-4** — `src/lib/i18n.tsx` defines `auth.updatePayment` in en (`"Update payment method"`) and ja (`"支払い方法を更新"`).
5. **AC-M3-5** — a helper `src/components/authFooterMode.ts` exports `pickPlanMode(plan, hasStripe): "upgrade" | "recover" | "manage"`. Unit tests in `src/components/__tests__/authFooterMode.test.ts` cover: (a) `("free", false) → "upgrade"`, (b) `("free", true) → "recover"`, (c) `("standard", true) → "manage"`, (d) `("pro", false) → "manage"` (defensive: a paid plan without Stripe is still "manage"; the Portal call will fail if there's truly no customer, but that's the correct diagnostic), (e) `(null, false) → "upgrade"` (unknown plan defaults to free-new).
6. **AC-INT** — `npm run typecheck` passes, `npm run lint` reports 0 errors and 0 warnings, `npm test` all suites green.

## Preregistered failure modes

- **PF1** — `hasStripe` reflects `data.stripe_customer_id`, which the webhook does NOT clear on downgrade. Verified by reading `webhook/route.ts:setPlanByCustomer` — the UPDATE is `{ plan: "free" }` only, so `stripe_customer_id` is preserved. If a future webhook edit adds `stripe_customer_id: null` to the downgrade UPDATE, the recover branch stops firing and the user goes back to being stuck. AC-M3-5 does not catch this — a spec-level runbook note added: "The recover UI depends on `stripe_customer_id` surviving webhook downgrade. Do not add `stripe_customer_id: null` to `setPlanByCustomer`'s downgrade UPDATE."
- **PF2** — A user with `{ plan: "pro", stripe_customer_id: null }` reaches the `manage` branch (per AC-M3-5(d)). Clicking Portal will hit `/api/billing/portal` and the profile-plan check returns 404/409 depending on the current portal route. This is a diagnostic path — the row is inconsistent — and preserving the current behavior is correct.
- **PF3** — Recover branch's Portal call goes through `goBilling("portal", t)`, which uses the same error handling as the existing manage branch. No new error path.
- **PF4** — The recover-branch label reads "Update payment method" for every downgrade cause (`canceled`, `unpaid`, `incomplete_expired`). A pedantic reader may object that a `canceled` user does not need to update a payment method — they need to re-subscribe. In practice the Stripe Customer Portal for a customer with a canceled subscription surfaces the "resubscribe" flow when opened (and the resubscribe flow itself asks for payment-method confirmation), so this label is a truthful entry-point for all three downgrade states. Not attempting to distinguish the three inside the AuthFooter avoids an extra Supabase column and a per-state UI matrix. Accepted UX simplification.

## Out of scope / Accepted tradeoffs

- **Distinguishing "unpaid" vs "canceled" vs "incomplete_expired" downgrade cases in the UI**. All three land in `{ plan: "free", stripe_customer_id: <cus_...> }`. The Portal handles all three. See PF4. `incomplete_expired` in particular can be resolved either through Portal-driven resubscribe or by a fresh `/api/billing/checkout` (the current live-subscription check in checkout does not include `incomplete_expired` in its live-status set, so a fresh checkout would succeed). Routing to Portal is the safer default: the user can see their history and choose. The extra Upgrade path is not blocked — it just isn't the default surface.
- **Cold-cache first-render Free flash**. During the first render after signIn when `displayProfile === null`, `plan` falls to `"free"` and `hasStripe` is undefined, so the UI shows the Upgrade branch briefly until the polling loop resolves. This is the same tradeoff PR #13 (mixed-cleanups) declared in its PF5. This M3 fix does not change it: if the underlying user is actually a downgraded former subscriber, they see Upgrade for one polling round-trip and then transition to the recover branch. The 409 that Upgrade → Checkout would return during that window is handled by the existing alert flow.
- **Webhook-side prevention of the state (e.g. keeping subscription plan for a grace period rather than downgrading immediately on unpaid)**. That is the `billing-flow.md` design decision and is not being revisited here. This PR only surfaces the Portal button.
- **jsdom / testing-library for component render**. Same rationale as PR #13 (mixed-cleanups): the boundary logic (`pickPlanMode`) is extracted and unit-tested; the render wiring is validated by AC-grep + branch review.

## Blast radius

- Files touched: `src/components/AuthFooter.tsx` (plan branch split), `src/components/authFooterMode.ts` (new helper), `src/components/__tests__/authFooterMode.test.ts` (new), `src/lib/i18n.tsx` (new i18n key in en/ja), `docs/fix-unpaid-portal-button.md` (this spec, new).
- No dependency added. No new env var. No API surface change.

## Platform impact

None. Pure client-side TS + i18n string. No OS-specific APIs.
