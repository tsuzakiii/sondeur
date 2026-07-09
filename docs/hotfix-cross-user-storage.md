# Hotfix — localStorage cross-user data leak

Issue: #1
Branch: `fix/cross-user-storage-hotfix`
Base: `master`
Related deploy: 7 commits `e58b82b..3d99aba` (already on `master`).

## Problem

Two localStorage keys leak per-account data across users on the same browser.

### B1 — `sondeur.trees.v1`

`src/lib/store.ts` added an owner tag (`sondeur.trees.owner.v1`) but treats a missing tag as `GUEST_OWNER`. Any browser that previously ran the pre-owner-tag build has trees but no owner tag, so:

1. `load()` reads `readStoredOwner()` → `null ?? GUEST_OWNER` → `"guest"`.
2. `state = { trees: readStoredTrees() }` — previous user A's synced trees appear in the sidebar.
3. If user B later signs in, `startSync` at `src/lib/sync.ts:184-196` sees `localOwner === "guest"`, treats A's trees as guest data, and **upserts them into B's Supabase account** via the `enqueue(..., "migrate tree")` path.

### B2 — `sondeur.profile.cache`

`src/components/AuthFooter.tsx:12` uses one constant key with no user scoping. When user A signs out and user B signs in in the same browser, B's `AuthFooter` mounts with A's plan/usage in the initial `useState` initializer, then overwrites once B's own profile fetch resolves — until then A's paid plan and usage bleed into B's UI.

## Fix

### B1 store.ts / sync.ts

Distinguish three localStorage states:
1. `owner tag == "guest"` — genuine guest, keep behavior.
2. `owner tag == <uid>` — signed-in user, keep behavior (existing owner-tag path).
3. `owner tag missing AND trees key present` — **pre-owner-tag legacy state**, unknown owner. Drop it: delete both `sondeur.trees.v1` and `sondeur.trees.owner.v1` at load, initialize state as an empty guest store.

Rationale: any cross-user upsert into a Supabase account is a hard boundary violation. Local-only guest trees are lost, which is acceptable because (a) the affected population is early-access users on a pre-launch product, and (b) if they had synced (signed in before), the cloud copy is intact and will re-hydrate on sign-in.

Implementation:
- Add `readStoredOwnerRaw(): string | null` returning `getItem(STORAGE_OWNER_KEY)` without the `??` fallback.
- In `load()`: if `raw === null`, check `localStorage.getItem(STORAGE_KEY) !== null`; if so, `removeItem` both keys before setting `storageOwner = GUEST_OWNER` and `state = { trees: {} }`.
- Keep the existing `storageOwner === GUEST_OWNER` → `readStoredTrees()` path for genuine guests (owner tag literally set to `"guest"`).
- No `sync.ts` change is strictly required — but as a defense-in-depth guard, in `startSync` also drop-through legacy state should never reach the `"guest" → uid` migration path because `load()` cleared it. Add a test that verifies this.

### B2 AuthFooter.tsx

Scope the profile cache by user id and prevent every path where uidA's data could reach uidB's render:

- Base key: `PROFILE_CACHE_BASE = "sondeur.profile.cache"` (identical to the legacy key).
- Per-user key: `${PROFILE_CACHE_BASE}.${userId}` (constructed at read/write time; base + dot + uid).
- Type `CachedProfile` carries `userId: string` in the payload itself (not just implied by the key). This is the anchor for the render-time second wall below.
- `loadCachedProfile(userId: string): CachedProfile | null` reads the per-user key AND validates that the parsed payload's `userId` field equals the requested `userId` (rejects tampered / mismatched entries with `null`).
- `saveCachedProfile(userId: string, p): void` writes the per-user key AND refuses payloads where `p.userId !== userId` (contract-violation guard, cannot sink cross-user data even if a caller passes the wrong pair).
- `clearAllCachedProfiles(): void` snapshots `Object.keys(localStorage)` into an array first (avoid live-collection mutation), then removes every key `k` where `k === PROFILE_CACHE_BASE` (legacy) OR `k.startsWith(PROFILE_CACHE_BASE + ".")` (per-user). Called on the signout transition (see effect ordering below).
- `resolveDisplayProfile(profile, authUserId): CachedProfile | null` — returns `profile` iff `profile.userId === authUserId`, else `null`. **This is the sole render-time wall.** The component calls this on every render before deriving `plan` / `usageText`.
- `useState<CachedProfile | null>` initial value is `null` (no user id available at init). Cache is loaded inside the `useEffect([auth])` after auth is known.

**Signout cache clear lives in `authState.ts`, not in `AuthFooter`**. The `onAuthStateChange` handler at `src/lib/authState.ts` is the single subscriber the app installs at `initAuth()` time via `page.tsx`. It runs for the entire lifetime of the tab, independent of whether any UI component is mounted. When `session?.user` becomes null and the previous `authInfo.kind` was `"signedIn"`, the handler calls `clearAllCachedProfiles()` in the same block that already invalidates in-flight sync (`stopSync({ clearLocal: true })`) and emits the signedOut state.

Locating the clear in the UI component (a previous iteration) was wrong for two reasons: (1) on mobile, `Sidebar` early-returns before rendering `AuthFooter` when the drawer is collapsed, so `AuthFooter` does not observe the signout event that fires while it is unmounted, and (2) even a module-level `let lastObservedAuthKind` inside `AuthFooter.tsx` fails when the tab first loads with the sidebar collapsed — the first observation of `auth.kind` happens only on the first `AuthFooter` mount, so a signout that occurs in another tab before the drawer is ever opened is misclassified as an initial-mount signedOut and the cache is not cleared. The authState subscriber has none of these blind spots because it starts observing at `initAuth()` and never stops.

`AuthFooter`'s `useEffect([auth])` therefore only handles the signedIn branch: it reads `cached = loadCachedProfile(auth.userId)`, defers `setProfile({ ...cached, userId: auth.userId, used: cached.monthKey === mk ? cached.used : 0 })` via `window.setTimeout(fn, 0)` (guarded by `cancelled` and `clearTimeout` cleanup — see PF7), and starts the profile-fetch loop. The signedOut branch is a bare `return` — no clear, no reset.

The initial signedOut state (Supabase not yet resolved) is safe because `authState.ts`'s handler is triggered by real state-change events from Supabase, not by the initial `authInfo = SIGNED_OUT` placeholder — the first event with `session?.user` sets `authInfo` to signedIn without ever entering the "prev was signedIn" clear branch.

The signedIn branch reads `cached = loadCachedProfile(auth.userId)`. If non-null, defers `setProfile({ ...cached, userId: auth.userId, used: cached.monthKey === mk ? cached.used : 0 })` via `window.setTimeout(fn, 0)`, guarded by a `cancelled` flag inside the callback and `clearTimeout` in the effect's cleanup. Then starts the profile-fetch loop (unchanged; every save/setProfile inside it uses `userId: uid`).

**Render-time wall is sufficient**: React `useEffect` fires AFTER render, so the render immediately triggered by an `auth` prop change from uidA to uidB would see `profile` still holding uidA's data if we relied on an in-effect reset. Even a `setTimeout(0)`-deferred reset lives one macrotask after render, not before it. The mechanically correct fix is at the render site: `resolveDisplayProfile(profile, auth.userId)` returns `null` whenever `profile.userId !== auth.userId`, so the component derives `plan` and `usageText` from `null` on the transition frame and falls through to `"free"` (the cold-cache branch already covered by PF5). Per-user localStorage keys prevent uidB's effect from ever reading uidA's cached data. Together — key-scoped localStorage + payload-userId validation in `loadCachedProfile` + render-time `resolveDisplayProfile` — every read path from A into B's rendered UI is closed. An effect-level `setProfile(null)` would be redundant defense; adding it just to feel safer is the wrong response to the lint rule.

**Why no `clearAllCachedProfiles()` on signedIn→signedIn user swaps**: uidA's cache lives under key `sondeur.profile.cache.uidA`; uidB's effect reads `sondeur.profile.cache.uidB` only. uidA's cache is invisible to uidB by key isolation. It stays on disk so uidA gets an optimistic paint if they later come back on this same browser. Actively clearing it on every session change would remove a legitimate feature without closing any leak — the leak is closed by the wall above.

## Acceptance criteria (machine-checkable)

1. **AC-B1a** — `src/lib/__tests__/store.test.ts` (new): given `localStorage` has `sondeur.trees.v1` populated and no `sondeur.trees.owner.v1`, calling `getState()` returns `{ trees: {} }` AND `localStorage.getItem("sondeur.trees.v1") === null` afterwards.
2. **AC-B1b** — same test file: given owner tag is `"guest"` and trees present, `getState()` returns the parsed trees (regression guard).
3. **AC-B1c** — same test file: given owner tag is a uid, `getState()` returns `{ trees: {} }` (existing behavior — non-owner sees nothing).
4. **AC-B1d** — same test file: after seeding legacy state (trees present, owner tag absent), call `getState()` first (which triggers `load()` and the legacy-state cleanup), then call `getStoredTreesForOwner("uidB")` — result must be `{}` AND `localStorage.getItem("sondeur.trees.v1") === null` (verifies no legacy tree survives into `startSync`'s merge path for any user id).
5. **AC-B2a** — `src/components/__tests__/authFooterCache.test.ts` (new): `saveCachedProfile("uidA", pA)` then `saveCachedProfile("uidB", pB)`; `loadCachedProfile("uidA")` returns `pA`, `loadCachedProfile("uidB")` returns `pB`.
6. **AC-B2b** — same test: after `clearAllCachedProfiles()`, both `loadCachedProfile("uidA")` and `loadCachedProfile("uidB")` return `null`.
7. **AC-B2c** — same test: legacy key `sondeur.profile.cache` (no dot suffix) present in localStorage is also removed by `clearAllCachedProfiles()` (cleans up the old build's leftover cache).
8. **AC-B2d** — same test: after `saveCachedProfile("uidA", pA); clearAllCachedProfiles();` then `loadCachedProfile("uidB")` returns `null`, AND `loadCachedProfile("uidA")` returns `null`. Combined with the useState initial `null`, no uidA cache can seed uidB's initial profile.
9. **AC-B2e** — same test file: `resolveDisplayProfile(pA, "uidB")` returns `null`; `resolveDisplayProfile(pA, "uidA")` returns `pA`; `resolveDisplayProfile(null, "uidB")` returns `null`. This is the mechanical evidence that the render-time wall blocks the uidA→uidB direct-switch first-render leak (React effects fire after render — see render-time-wall rationale in B2).
10. **AC-B2f** — same test file: a tampered/mismatched payload in `sondeur.profile.cache.uidA` (with `userId: "uidB"` inside) is rejected by `loadCachedProfile("uidA")` with `null` (payload-userId validation guard).
11. **AC-B2g** — same test file: `saveCachedProfile("uidA", pB)` where `pB.userId === "uidB"` writes NOTHING to `sondeur.profile.cache.uidA` (contract-violation guard against callers passing the wrong pair).
12. **AC-INT** — `npm run typecheck` passes (no new type errors); `npm run lint` reports 0 errors and 0 warnings (the release-readiness PR that lands ahead of this one enabled the CI `lint` step and cleaned the pre-existing diagnostics, so this branch's target is clean lint, not baseline unchanged); `npm test` shows all suites green.

## Module extraction (deferred from B2 to enable helper unit tests in node-env)

Move `PROFILE_CACHE_BASE`, `loadCachedProfile(userId)`, `saveCachedProfile(userId, p)`, `clearAllCachedProfiles()`, `resolveDisplayProfile(profile, authUserId)`, and the `CachedProfile` type from `src/components/AuthFooter.tsx` to a new file `src/components/authFooterCache.ts`. `AuthFooter.tsx` imports them. This keeps the boundary logic in a `.ts` file that vitest's existing `include: src/**/*.test.ts` + `environment: node` pattern already covers, no config change.

## Preregistered failure modes (before implementing)

- **PF1** — Deleting legacy `sondeur.trees.v1` on load could race with `persist()` if `emit()` fires before `load()` completes; verify `load()` runs first and only once (existing `loaded` flag).
- **PF2** — SSR: `localStorage` is undefined server-side. Both fixes must remain guarded by `typeof window`.
- **PF3** — `clearAllCachedProfiles` iterating `localStorage` keys mutates the collection while iterating; snapshot keys into an array first.
- **PF4** — Existing e2e / vitest suites might assume a global `sondeur.profile.cache` key; grep before shipping.
- **PF5** — `useState(null)` change removes optimistic first paint from cache — signed-in users whose cache is missing (first login on device, cache expired, `loadCachedProfile` returned null, or the cache load's `setTimeout(0)` has not fired yet) will render with `displayProfile === null` for one or two render cycles, at which point `plan` falls through to `"free"` and the popup shows Upgrade controls. The effect kicks off `loadProfile()`; when the fetch resolves, `setProfile({ userId, plan: "pro" | ... })` triggers a re-render with the correct plan. Verify the placeholder empty string in `usageText` still works and that a Pro user briefly seeing the "Upgrade" popup before the fetch resolves does not misbehave (the checkout route's 409 duplicate-subscription guard is the safety net if they click through). Listed separately as a follow-up UX improvement in Out of scope.
- **PF6** — `readStoredOwnerRaw` and `load()`'s localStorage removeItem calls run in Chrome contexts (3rd-party iframe, private mode with cookies blocked) that throw `SecurityError` on any localStorage access. Wrap all localStorage reads/writes in try/catch and fail-open to an empty in-memory store.
- **PF7** — `setTimeout(0)`-deferred setProfile from the cache path could fire after the effect's cleanup if the timer was already scheduled. Guard the callback with the `cancelled` flag and `clearTimeout` the handle in the cleanup.

## Out of scope / Accepted tradeoffs

- **Legacy guest tree data loss** — pre-owner-tag localStorage-only trees are permanently deleted for legacy browsers. Avoidability check: could we KEEP the trees by treating unknown-owner as guest? No — that IS the vulnerability. Could we recover them into the newly-signed-in user's cloud? No — that IS the upsert leak we are fixing. This is signal-inherent.
- **Optimistic profile-cache paint removed** — signed-in users no longer see cached plan on first render. Avoidability check: could we cache per-user without a userId at init? No — the only user-scoping key we have is the userId itself, and it arrives with the auth effect. Removing the initial optimistic paint is required by the boundary fix.
- **Concurrent-checkout race (M2)** — not in this hotfix; belongs to a separate design (either dedup at Stripe session create-time or client-side single-in-flight guard).
- **`unpaid` grace-period UI stuck (M3)** — spec-level Stripe configuration is the real fix; code change not scoped here.
- **Polling 15s cutoff (M4)** — UX polish, not a data-leak class bug.
- **Pre-fetch "Free" flash for signed-in Pro users with a cold cache (PF5 detail)** — one render cycle shows Upgrade UI before the profile fetch resolves. Avoidability check: could we hide the plan bar / Upgrade section while `displayProfile === null`? Yes, in principle — but that changes the visible layout for the loading state and expands the diff outside the boundary fix. The safety property that matters (no wrong-user data, no double-billing) is preserved: the popup Upgrade buttons hit `/api/billing/checkout`, which returns 409 for any user already on a paid plan. Deferred as follow-up UX work.
- **Legacy JPY-lookup-key subscriber webhook 500 (M1)** — requires ops-level verification (is there a live subscriber on the old price?); not code-fixable in isolation.

## Platform impact

None. Pure client-side JS/TS; no tty, no filesystem, no process APIs, no shell. Runs identically on every OS the browser runs on.

## Blast radius (self-declared, will be verified by Phase 1.5 Codex)

- Files touched: `src/lib/store.ts`, `src/components/AuthFooter.tsx`, `src/components/authFooterCache.ts` (new), `src/lib/__tests__/store.test.ts` (new), `src/components/__tests__/authFooterCache.test.ts` (new), `docs/hotfix-cross-user-storage.md` (this spec).
- Files read for context but not touched: `src/lib/sync.ts` (contract unchanged — behavior verified by AC-B1d), `src/lib/authState.ts` (contract already provides `userId` on the `signedIn` variant).
- Downstream consumers of `getStorageOwner` / `getStoredTreesForOwner` / `clearTrees` / `hydrate`: single caller (`src/lib/sync.ts`), unchanged.
- No API routes touched.
- No dependency added.
