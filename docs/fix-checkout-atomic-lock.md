# Closes #15 — one active Checkout Session per userId via DB-tracked in-flight Session + lock + list-and-expire

Branch: `fix/checkout-atomic-lock`
Base: `master`

## Cause

Even after PR #16 (idempotency key + pre-create profile re-read), a Free user can open two tabs, click Standard in one and Pro in the other before either webhook fires, receive two Checkout Session URLs, and pay both.

Five previous spec drafts on this branch were rebuilt by Codex spec review, each landing on a different failure mode until the actual root cause surfaced:

- r1-r3 attacked the symptom after the fact (lock timing, webhook auto-cancel, refund logic).
- r4-r5 moved to "expire any prior open Session before creating a new one via `stripe.checkout.sessions.list`" — correct in spirit, but Stripe's list API filters open Sessions by `customer` and NOT by `client_reference_id`, and `customer` is not populated on `profiles` until the webhook fires for the first successful `checkout.session.completed`. During the ~5-minute Stripe card-entry window on the first Session, `stripe_customer_id` remains null, so the list step has nothing to filter on and a second-tab cross-plan checkout for the same user cannot see or expire the first tab's Session.

The root cause is: **for a Free user's first checkout, there is a window during which the app has created a Session but has no `customer` handle to look it up by**. Closing the race in that window requires Sondeur to track the in-flight Session ID itself, in its own database, keyed by userId.

## Fix

Four components, each closing a specific window:

### Component 1 — DB lock (short-window serialization)

New table `public.checkout_locks (user_id uuid primary key references auth.users on delete cascade, locked_at timestamptz not null, token text not null)`. RLS `using (false) with check (false)` for `anon`/`authenticated`. Two `SECURITY DEFINER` RPCs (`try_acquire_checkout_lock`, `release_checkout_lock`) with `service_role`-only execute grants.

`try_acquire_checkout_lock(p_user_id uuid) returns text` — 60-second TTL, constant inside the function:
```
insert into public.checkout_locks (user_id, locked_at, token)
values (p_user_id, now(), gen_random_uuid()::text)
on conflict (user_id) do update
  set locked_at = excluded.locked_at,
      token = excluded.token
  where checkout_locks.locked_at < now() - interval '60 seconds'
returning token
```

`release_checkout_lock(p_user_id uuid, p_token text) returns boolean` — deletes only when the caller's token matches; returns NULL when no row matches (loser or already-released).

The lock's purpose is to serialize handler entry for one user so that Components 2 and 3 observe a consistent state. It is NOT the primary defense.

### Component 2 — DB-tracked in-flight Session ID

New column `profiles.in_flight_checkout_session_id text` (nullable). Populated by the checkout route AFTER `sessions.create` succeeds and BEFORE the response ships. Cleared by the webhook only on `checkout.session.completed` and `checkout.session.expired` — and only when the event's Session ID matches the stored pointer (see Component 4). Other event types do NOT touch this column.

Column-level access: this column joins the same "server-only" set as PR #14's `stripe_customer_id`. Table-level grants on `profiles` continue as they are — `authenticated` already has `SELECT` on the table through the "read own profile" RLS policy — but exposure of `in_flight_checkout_session_id` to a signed-in user is not a security concern: it is the user's own Session ID, and even holding it does not grant any privilege beyond visiting the Stripe-hosted URL, which they already have if the current tab opened it.

### Component 3 — Route wiring: expire the prior in-flight Session before creating a new one

`src/app/api/billing/checkout/route.ts` structure:

```
1. auth = getRequestUser()             // existing
2. token = tryAcquireCheckoutLock(uid) // Component 1
     if "unavailable" → 503
     if null → 409 "checkout in progress"
3. try {
     fresh = re-read profile           // existing (PR #16)
     if fresh.in_flight_checkout_session_id {
       await expireSessionIfCurrent(   // Component 3
         fresh.in_flight_checkout_session_id,
         requestedPrice
       )
     }
     // 4xx guards AFTER cleanup so stale in-flight is cleared even on turn-away
     if fresh.plan !== "free" → 409
     if fresh.stripe_customer_id && live_subscription_found → 409
     session = sessions.create(...)     // existing (PR #16)
     await recordInFlightSession(uid, session.id)
     return { url: session.url }
   } catch (e) {
     if e instanceof SessionAlreadyCompletedError → 409 "checkout already completed"
     throw
   } finally {
     await releaseCheckoutLock(uid, token)
   }
```

`expireSessionIfCurrent(sessionId, requestedPrice)`:
- Retrieves the Session (`stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] })`).
- Reads `sessionPrice = retrieved.line_items.data[0].price.id`.
- If `sessionPrice === requestedPrice`: leave the Session alone. PR #16's idempotency key deduplicates the same-plan create call, so the following `sessions.create` returns the same Session URL as the prior tab and Stripe treats them as one identity. Do NOT clear `in_flight_checkout_session_id` here — the pointer must survive to be found by a subsequent DIFFERENT-plan click. It is cleared only when the Session actually leaves the payable state, via the webhook (Component 4).
- Else: call `stripe.checkout.sessions.expire(sessionId)`.
  - If it succeeds (or throws `session_already_expired`): clear `in_flight_checkout_session_id` from `profiles` and proceed to the 4xx guards + create.
  - If it throws `session_already_completed`: the user just paid the prior Session in another tab. Throw `new SessionAlreadyCompletedError()` (caught in the outer route via `instanceof`, mapped to 409). Do NOT clear `in_flight_checkout_session_id` — the webhook's `checkout.session.completed` handler will do that with the Session-ID conditional UPDATE.
  - If it throws anything else (rate limit, API failure): rethrow. The route MUST NOT proceed to `sessions.create` if it cannot verify the prior Session is no longer payable.

Error classification is by Stripe's `error.code`:
- `session_already_expired` → swallow (goal state reached).
- `session_already_completed` → the helper throws a **dedicated class** `SessionAlreadyCompletedError extends Error`. The route catches it with `instanceof SessionAlreadyCompletedError` and maps to 409 `checkout already completed`. This is stricter than the r6 spec's message-string sentinel: a rogue `throw new Error("__ALREADY_COMPLETED__")` from anywhere else in the code path would no longer trigger the 409 misclassification.
- everything else → rethrow.

Message strings are NOT part of the classifier; error codes are stable, messages are not.

### Component 4 — Webhook clears `in_flight_checkout_session_id` (Session-ID-matched)

`src/app/api/billing/webhook/route.ts`:
- On `checkout.session.completed`: after `setPlan(...)` succeeds, run `UPDATE profiles SET in_flight_checkout_session_id = null WHERE id = <userId> AND in_flight_checkout_session_id = <event.data.object.id>`. The `AND` clause is load-bearing: without it, a late-arriving webhook for a Session that was already superseded by a newer recorded pointer would clear the newer pointer's tracking.
- On `checkout.session.expired` (new branch): the same conditional UPDATE with `id = <userId>` (from `session.client_reference_id`) AND `in_flight_checkout_session_id = <event.data.object.id>`. Handles Stripe's natural expiry after 24 hours or the expiry we triggered via `sessions.expire`.
- Existing `customer.subscription.*` branches are unchanged. `subscription.*` events do NOT touch `in_flight_checkout_session_id`.

## Acceptance criteria (machine-checkable)

1. **AC-#15-1** — `supabase/migrations/0007_checkout_locks_and_in_flight.sql` (new):
   - `CREATE TABLE IF NOT EXISTS public.checkout_locks (...)`.
   - `ALTER TABLE public.checkout_locks ENABLE ROW LEVEL SECURITY;`.
   - `DROP POLICY IF EXISTS "no client access" ON public.checkout_locks; CREATE POLICY "no client access" ON public.checkout_locks FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);` — the `DROP ... IF EXISTS` before `CREATE` makes re-application safe.
   - `REVOKE ALL ON TABLE public.checkout_locks FROM anon, authenticated, PUBLIC;`.
   - `CREATE OR REPLACE FUNCTION try_acquire_checkout_lock(...)` / `release_checkout_lock(...)` with `SECURITY DEFINER`, `SET search_path = public, pg_temp`.
   - `REVOKE ALL ON FUNCTION ... FROM anon, authenticated, PUBLIC; GRANT EXECUTE ON FUNCTION ... TO service_role;` — REVOKE and GRANT are naturally idempotent.
   - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS in_flight_checkout_session_id text;` — the `IF NOT EXISTS` guards re-application.
   
   Every statement is either naturally idempotent (`CREATE OR REPLACE`, `REVOKE`, `GRANT`, `ALTER ... ENABLE`) or explicitly guarded (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`). Re-applying the migration in the Supabase SQL Editor is safe.

2. **AC-#15-2** — `src/lib/checkoutLock.ts` (new) exports:
   - `tryAcquireCheckoutLock(userId): Promise<string | null | "unavailable">` — calls `try_acquire_checkout_lock` RPC via `getServiceSupabase()`. Returns `"unavailable"` when the service client is null (fail-CLOSED). Returns `null` on race loser or on RPC error (with `Sentry.captureException`). Returns the token string on success.
   - `releaseCheckoutLock(userId, token): Promise<void>` — calls `release_checkout_lock` RPC. Resolves even on error (best-effort; TTL is the backstop), errors captured via `Sentry.captureException` but not rethrown.
   
   Unit tests in `src/lib/__tests__/checkoutLock.test.ts` (6 cases): (a) service client returns token → acquire returns token; (b) service client returns `{ data: null, error: null }` → acquire returns `null`; (c) `getServiceSupabase()` returns null → acquire returns `"unavailable"`, no RPC call attempted; (d) service client returns error → acquire returns `null` and `Sentry.captureException` called; (e) release with matching token → RPC called, promise resolves; (f) release with service client error → promise still resolves, `Sentry.captureException` called.

3. **AC-#15-3** — `src/lib/inFlightSession.ts` (new) exports:
   - `class SessionAlreadyCompletedError extends Error` — dedicated marker class for the "prior tab paid mid-race" outcome.
   - `expireInFlightSessionIfDifferentPlan(stripe, supabase, userId, sessionId, requestedPrice): Promise<"cleared" | "kept-same-plan">` — retrieves the Session (with `expand: ["line_items"]`), compares prices, calls `stripe.checkout.sessions.expire` when different, clears the DB pointer via `clearInFlightSession(supabase, userId, sessionId)` on any path that produces `"cleared"`. On expire throwing `code: "session_already_expired"` returns `"cleared"`. On `code: "session_already_completed"` throws `new SessionAlreadyCompletedError()`. On any other error rethrows. If the retrieved Session's `status` is `"expired"` clears and returns `"cleared"`; if `"complete"` throws `SessionAlreadyCompletedError`.
   - `recordInFlightSession(supabase, userId, sessionId): Promise<void>` — updates `profiles.in_flight_checkout_session_id = $1 WHERE id = $2` via the service Supabase client.
   - `clearInFlightSession(supabase, userId, sessionId): Promise<void>` — updates `profiles.in_flight_checkout_session_id = null WHERE id = $1 AND in_flight_checkout_session_id = $2` via the service client. The Session-ID condition prevents a late webhook for an older Session from clearing a newer pointer.
   
   Unit tests in `src/lib/__tests__/inFlightSession.test.ts` cover: (a) different plan → expire is called, returns `"cleared"`; (b) same plan → expire NOT called, returns `"kept-same-plan"`; (c) expire throws `code: "session_already_expired"` → returns `"cleared"`; (d) expire throws `code: "session_already_completed"` → throws `SessionAlreadyCompletedError` (assert `instanceof`); (e) expire throws anything else → the helper rethrows the original error; (f) `recordInFlightSession` UPDATE calls the correct SQL shape (assert the SQL includes `in_flight_checkout_session_id = ?` in SET and the WHERE targets `id`); (g) `clearInFlightSession` UPDATE calls the correct SQL shape and includes the Session-ID condition in WHERE (assert the mocked chain: a stale webhook with a mismatched Session ID does NOT clear the pointer — mock returns `{ count: 0 }` in that case).

4. **AC-#15-4** — `src/app/api/billing/checkout/route.ts` structure follows the order in Component 3. The lock branches `"unavailable"` and `null` return their 503/409 immediately WITHOUT entering the `try` — the lock was never acquired so there is nothing to release. Only the string-token branch enters `try { ... } catch { if (e instanceof SessionAlreadyCompletedError) return 409; else throw } finally { await releaseCheckoutLock(uid, token) }`. `recordInFlightSession` is called after `sessions.create` succeeds and before the response is returned. If `recordInFlightSession` itself throws, the error propagates to the outer catch (framework 500) and the finally still releases the lock.

5. **AC-#15-5** — `src/app/api/billing/webhook/route.ts` clears `in_flight_checkout_session_id` via `clearInFlightSession(supabase, userId, event.data.object.id)` on:
   - `checkout.session.completed` — after `setPlan(...)` succeeds, using `session.client_reference_id` as userId and `session.id` as the session ID.
   - `checkout.session.expired` — new branch, same shape: `session.client_reference_id` as userId, `session.id` as the session ID.
   
   Both calls MUST pass the Session ID so the WHERE clause in `clearInFlightSession` protects against a late webhook for an older Session clearing a newer pointer. Existing `customer.subscription.*` branches are unchanged.

6. **AC-#15-6** — `scripts/release_check.mjs` migration presence check includes `0007` alongside `0001-0006`.

7. **AC-#15-7** — `docs/supabase-production-check.sql` gains six new verifications:
   - `checkout_locks` table exists AND RLS enabled.
   - `try_acquire_checkout_lock` and `release_checkout_lock` exist.
   - Function EXECUTE grants show ONLY `service_role`.
   - Table grants show ONLY `service_role` for `checkout_locks`.
   - The `using (false)` policy exists on `checkout_locks` for `anon` and `authenticated`.
   - `profiles.in_flight_checkout_session_id` column exists (text, nullable).

8. **AC-INT** — `npm run typecheck` passes, `npm run lint` reports 0 errors and 0 warnings, `npm test` all suites green.

## Preregistered failure modes

- **PF1** — 60-second lock TTL. Handler wall time is <3s typical (retrieve + optional expire + create + record). 60s gives 20× headroom for the p99 tail. Shorter (30s) risks racing itself under Stripe API retries; longer risks locking users out on real crashes.
- **PF2** — `SECURITY DEFINER` RPCs pin `search_path = public, pg_temp`.
- **PF3** — `checkout_locks` isolated table + `using (false)` RLS + revoked table grants: no client role can observe or modify.
- **PF4** — Fail-CLOSED on `SUPABASE_SECRET_KEY` missing (503).
- **PF5** — `in_flight_checkout_session_id` on `profiles` is readable by the row owner via the "read own profile" RLS policy. That is acceptable: the value is the user's own Session ID from a URL that Stripe already served them. The write path is service-role-only (webhook and checkout route via `getServiceSupabase`), so a client cannot self-clear or spoof. Note: a Stripe Checkout URL includes tokens beyond the Session ID (client_secret in the URL fragment), so the Session ID alone does not grant checkout access; nothing in this design implies otherwise.
- **PF6** — Error classification uses Stripe `error.code`, not `error.message`. Codes are documented stable API surface; messages change with localization or Stripe UI updates.
- **PF7** — The webhook's new `checkout.session.expired` branch relies on Stripe delivering that event within 24 hours of the natural expiry, which is documented behavior. If it never arrives (delivery failure exceeding the retry window), the `in_flight_checkout_session_id` in `profiles` becomes stale; the next checkout attempt's `expireInFlightSessionIfDifferentPlan` helper will get `session_already_expired` from Stripe and clear the DB pointer naturally. Self-healing.
- **PF8** — `sessions.create` returns before `recordInFlightSession` writes. If the response ships and the write fails silently (Supabase down between create and write), the DB pointer is not set and a following tab's cross-plan checkout misses this Session. Mitigation: `recordInFlightSession` throws on error, and the `finally` still releases the lock; the caller sees a 500 and can retry. Cost: user sees an error even though Stripe already has their Session — but the safer default (they retry, we don't accidentally leave a Session unrecorded) is preferred over silent leak.
- **PF9** — Same-plan double-click behavior: preserved by PR #16 idempotency. When the second click's `expireInFlightSessionIfDifferentPlan` sees the same plan, it returns `"kept-same-plan"` and the route falls through to `sessions.create`, which Stripe deduplicates via the idempotency key. The user gets the same Session URL as the first tab. PR #16's guarantee is not regressed.
- **PF10** — Racing tab UX: last-checkout-wins for cross-plan clicks. Stripe's own expired-Session page handles the losing tab gracefully.

## Out of scope

- Route-level integration test — same rationale as PR #16 (M2). Helper unit tests + AC-grep cover the wiring.
- Client-side retry UX polish — 409 shows the alert; retry after 60s.
- Backfill of `in_flight_checkout_session_id` for existing rows — column defaults to null, which is the correct semantics for existing rows (no in-flight Session known).
- Recovery from >20 open Sessions for a single customer — this fix relies on Sondeur creating at most one Session at a time per user going forward, so the historical accumulation case is not addressed. Historical stale open Sessions expire naturally in 24 hours from Stripe's side.

## Blast radius

- Files touched: `supabase/migrations/0007_checkout_locks_and_in_flight.sql` (new), `src/lib/checkoutLock.ts` (new), `src/lib/__tests__/checkoutLock.test.ts` (new), `src/lib/inFlightSession.ts` (new), `src/lib/__tests__/inFlightSession.test.ts` (new), `src/app/api/billing/checkout/route.ts` (lock + Component 3 + `recordInFlightSession`), `src/app/api/billing/webhook/route.ts` (clear `in_flight_checkout_session_id` on completed / new expired branch), `scripts/release_check.mjs` (0007 check), `docs/supabase-production-check.sql` (six new verifications), `docs/fix-checkout-atomic-lock.md` (this spec, new).
- One new table, one new column, two new RPCs. All private to `service_role`.

## Platform impact

None. SQL DDL + server-side TS + docs.

## Post-r7 impl-carried resolutions

Codex spec review r7 raised further detail gaps beyond the design core. This branch triaged them into implementation-carried resolutions rather than another spec revision. The impl and its branch review must satisfy each of these — they are contract points that AC-grep does not fully cover:

- **impl-r7-F2 (superseded by branch-r1-F1)** — `expireInFlightSessionIfDifferentPlan` inspects `retrieved.status` FIRST, before the plan comparison. `"expired"` → clear pointer, return `"cleared"`. `"complete"` → throw `SessionAlreadyCompletedError` so the route returns 409 (the user just paid the prior tab; a new Session would race the subscription that just came into existence).
- **impl-r7-F3** — Reading `retrieved.line_items.data[0].price.id` must be null-guarded. If any of the chain is undefined (Session retrieved without `expand: ["line_items"]`, empty data array, deleted price object), treat it as "unable to determine plan": call `stripe.checkout.sessions.expire` unconditionally (safest for the invariant) and if expire fails on `session_already_completed` throw the sentinel.
- **impl-r7-F4** — `recordInFlightSession` MUST throw on Supabase error. Silent resolve would ship a Session URL that the DB doesn't know about, breaking the invariant. Unit test asserts throw on `{ error: not null }` from the mocked client.
- **impl-r7-F5** — The route's `sessions.create` argument list is unchanged from PR #16 including its `idempotencyKey` computed by `checkoutIdempotencyKey(userId, plan, priceId, hasStripe)`. Same-plan double-click deduplication is Stripe-side. This branch does not modify that key.
- **impl-r7-F6** — Atomicity gap between `sessions.create` success and `recordInFlightSession`. Handled with: `try { session = await sessions.create(...); try { await recordInFlightSession(uid, session.id) } catch (recErr) { try { await stripe.checkout.sessions.expire(session.id) } catch {} ; throw recErr } }`. If the DB write fails, the just-created Session is immediately expired so it cannot be paid. The outer 500 tells the caller the checkout did not complete; retry is safe.
- **impl-r7-F13 (Low → helper naming)** — The route calls the helper by its exported name `expireInFlightSessionIfDifferentPlan`. Component 3's narrative name `expireSessionIfCurrent` from an earlier draft is discarded.

`docs/pgcrypto` note: `gen_random_uuid()` is available on Supabase without an explicit `CREATE EXTENSION pgcrypto` in the migration — Supabase preinstalls the `pgcrypto` extension in the `extensions` schema. No migration change needed.

## Deploy notes

- Apply `0007_checkout_locks_and_in_flight.sql` in the production Supabase SQL Editor BEFORE promoting to Vercel Production.
- After migration, run the updated `docs/supabase-production-check.sql` and confirm all six new verifications pass.
- No env var changes.
