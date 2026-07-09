# Mixed cleanups — polling, wedge geometry, cycle safety, pricing doc

Closes #7 (M4), #8 (L1), #9 (L2), #10 (L3), #11 (L4).
Branch: `fix/mixed-cleanups`
Base: `master`

Five independent defects surfaced by the earlier pr-merge-review that share no code paths beyond three files. Bundled into one PR because each is small in scope (a few functions or a doc section) and none depend on the others.

## Fix scope

### 1. AuthFooter polling — `src/components/AuthFooter.tsx`

- **M4 (#7)**: raise `maxAttempts` from 10 to 30 (interval unchanged at 1.5s), so the checkout-success polling covers ~45s of webhook delay instead of ~15s. Add a "billing.slowNote" i18n string that renders inline **under the Plan label in the AuthFooter island** (not inside the page.tsx success notice — kept adjacent to the plan display it explains) once `attempt >= 10` and the fetched profile plan is still Free. The note reads "反映に時間がかかっています / Taking longer than usual. Try refreshing." When polling finally sees a non-Free plan, the note disappears.
- **L1 (#8)**: replace the inter-attempt `await new Promise(r => window.setTimeout(r, 1500))` with a cancellable sleep. Approach: the effect scope holds a `cleanupSleep: (() => void) | null` reference. Each sleep call assigns `cleanupSleep = () => { window.clearTimeout(handle); resolve(); }` and clears itself after the timer fires or after being invoked. The effect's cleanup, in addition to setting `cancelled = true`, calls `cleanupSleep?.()` which both `clearTimeout`s the pending timer AND resolves the outstanding promise so `await` unblocks. The loop head then observes `cancelled = true` and returns. No extra Supabase fetch fires after the cleanup runs, and no promise stays pending forever.

### 2. GraphView wedge — `src/components/GraphView.tsx`

- **L2 (#9)**: in `computeWedgeAngles`, when `leafIdx === 1` after the DFS (the tree has exactly one leaf — the sole child of the root, or the root itself for a bare-root tree), the current formula puts that leaf at `BASE_ROTATION + π` (opposite the intended direction). Special-case: if `total === 1`, set every ranged node's angle to `BASE_ROTATION` (the "真上やや右" default) instead of computing from the formula. The multi-leaf path is untouched, so existing balanced-tree geometry is preserved.

### 3. store.ts cycle guard — `src/lib/store.ts`

- **L3 (#10)**: `depthOf` and `pathToNode` both walk `parentId` links. If a data corruption from sync merge produces two nodes each pointing to the other as `parentId`, the walk never terminates. Add a Set-based visited guard to both functions. On revisit, `depthOf` returns the depth accumulated so far; `pathToNode` returns the path collected so far (both fail-open — a corrupted tree renders as best it can rather than hanging the tab). Hard cap at 1000 iterations as a second safety.

### 4. pricing-model.md — `docs/pricing-model.md`

- **L4 (#11)**: rewrite the "Free plan exposure" bullets to reflect the actual enforcement:
  - Guest exposure: `DAILY_LIMIT = 15` (from `src/lib/guestRateLimit.ts`) enforced server-side per-IP-hash, resetting daily. Worst case ~$0.34/day per IP. The `GUEST_NODE_LIMIT = 10` in `planLimits.ts` is a client-side cumulative gate that a determined user can bypass by clearing localStorage or using another browser profile; it is a friction check, not a hard bound.
  - Free (signed-in) exposure: 20 nodes/month enforced by the `consume_node_quota` RPC. The old ~$0.45 estimate is retained but now cited as a monthly ceiling, not a one-shot number.

## Acceptance criteria (machine-checkable)

1. **AC-M4-1** — `src/components/AuthFooter.tsx` defines `maxAttempts = 30` when `billingReturn === "success"`, unchanged (=1) otherwise. Verify by grep after edit.
2. **AC-M4-2** — i18n dictionaries in `src/lib/i18n.tsx` gain `billing.slowNote` in both en and ja. Verify by grep.
3. **AC-M4-3** — a helper (e.g. `shouldShowSlowNote(attempt, plan)` extracted from the polling loop, or an inline predicate exercised via unit test) returns true only when `attempt >= 10` AND `plan === "free"`. Tests assert: (a) attempt 0-9 with plan "free" → false, (b) attempt 10+ with plan "free" → true, (c) attempt 10+ with plan "pro" → false (polling has succeeded, note must not appear). This mechanically covers PF4.
4. **AC-L1-1** — the inter-attempt sleep is cancellable. Extract the sleep + cancel wiring into a testable helper (e.g. `createCancellableSleep(ms): { promise, cancel }` in `src/lib/cancellableSleep.ts`) and add unit tests using `vi.useFakeTimers()`: (a) awaiting the promise resolves after `ms` when no `cancel()` is called (advance timers), (b) calling `cancel()` before the timer fires resolves the promise synchronously AND does not fire the setTimeout callback afterwards (assert timer count via `vi.getTimerCount()` before and after cancel), (c) calling `cancel()` after the timer fires is a no-op that does not throw.
5. **AC-L2-1** — extract `computeWedgeAngles` and its constants (`BASE_ROTATION`, `RING`) into `src/components/wedge.ts` (named exports). Unit tests in `src/components/__tests__/wedge.test.ts` assert: (a) **bare root tree** (root only, no children): the root's angle is `BASE_ROTATION` (not `BASE_ROTATION + π`), (b) **single-child tree** (root + one child): the child's angle is `BASE_ROTATION`, (c) **two-child balanced tree**: the two children are placed symmetrically about `BASE_ROTATION` (equal absolute offset from `BASE_ROTATION`, opposite sign), (d) **three-child tree**: children are placed at three evenly-spaced angles around `BASE_ROTATION` at 2π/3 intervals.
6. **AC-L3-1** — `src/lib/__tests__/store.test.ts` gains cases: (a) `depthOf` on a tree with a 2-node parentId cycle (n1 → n2 → n1) returns a finite number without hanging; the returned depth is bounded by the number of unique visited nodes (i.e., **verifies the visited-Set path is engaged, not just the hard cap** — assertion `result < 100` catches a hard-cap-only implementation because visited Set would return 2, hard cap only would return 1000), (b) `pathToNode` on the same cyclic tree returns an array with no duplicates and bounded length (again `< 100` to distinguish visited from hard-cap), (c) both functions return correct values on a normal 5-node linear tree (regression), (d) `depthOf` on an unrelated tree with 50 real depth returns exactly 50 (confirms the hard cap doesn't fire on legitimate depth).
7. **AC-L4-1** — `docs/pricing-model.md` "Free plan exposure" section explicitly names `DAILY_LIMIT` (with value 15), `GUEST_NODE_LIMIT` (with value 10 and note that it is client-side and bypassable), and the `consume_node_quota` RPC, and states the guest exposure as per-IP per-day (with a $/day figure), not one-shot.
8. **AC-INT** — `npm run typecheck` passes, `npm run lint` reports 0 errors and 0 warnings, `npm test` shows all suites green.

## Preregistered failure modes

- **PF1** — L2 special-case for `total === 1` might miss the "bare root, no children" case (which also has `leafIdx === 1` at the end of DFS because the root itself is a leaf). Verify test coverage for the root-alone case.
- **PF2** — L3 hard cap at 1000 might be reached in a legitimate deep tree. Confirm current use cases stay under ~50 depth. `depthOf` at depth 1000 returning 1000 is not correct data but is not catastrophic either.
- **PF3** — L1 cancellable sleep: if the timer fires exactly at the same tick as `cancelled = true`, ensure the callback checks `cancelled` before advancing the loop (existing guard preserves this).
- **PF4** — M4 raising to 30 attempts extends the user-visible loading period. The reload note surfacing at attempt 10 gives the user an out. Verify the note does not appear when polling succeeds early.
- **PF5** — L4 doc update might contradict the existing `docs/pricing-model.md` gross-margin table (which uses per-month, not per-day guest cost). Only the exposure section is updated; margin tables are not touched.

## Out of scope

- **jsdom / testing-library adoption for component render tests** — AC-M4-1/2 and AC-L1-1 are verified via helper extraction and `vi.useFakeTimers()`, not via `AuthFooter` component render. Adding React DOM testing infrastructure is a separate proposal.
- **Supabase realtime for M4** — separate, larger design.
- **Sync-side prevention of cycle creation for L3** — this hotfix only guards the readers; preventing the writer from producing cycles is out.
- **Polling location (mobile sidebar collapsed → AuthFooter unmounted → polling does not start)** — this is a structural gap surfaced by the per-commit review of this branch. Moving the polling out of the UI layer (into `authState.ts` or `page.tsx`) is a scope-widening design change tracked separately as [#12](https://github.com/tsuzakiii/sondeur/issues/12). This PR keeps polling in `AuthFooter`; the 10→30 attempt extension and cancellableSleep still deliver value when the sidebar is open, which is the desktop path and the mobile path once the user opens the drawer.

## Blast radius (self-declared)

- Files touched: `src/components/AuthFooter.tsx` (M4 + L1), `src/components/GraphView.tsx` (L2 imports the extracted module + cycle guard on `walk`/`countDescendants`), `src/components/wedge.ts` (new, L2), `src/components/__tests__/wedge.test.ts` (new), `src/lib/cancellableSleep.ts` (new, L1), `src/lib/__tests__/cancellableSleep.test.ts` (new), `src/lib/pollingSlowNote.ts` (new, M4 predicate), `src/lib/__tests__/pollingSlowNote.test.ts` (new), `src/lib/store.ts` (L3 cycle guards on `depthOf` / `pathToNode`), `src/lib/__tests__/store.test.ts` (L3 tests appended), `src/lib/i18n.tsx` (M4 new key), `docs/pricing-model.md` (L4), `docs/fix-mixed-cleanups.md` (this spec).
- No API routes touched. No dependency added. No CI change.

## Platform impact

None. No OS-specific APIs are touched (no tty/console I/O, no filesystem or path semantics, no process/signal APIs, no shell invocation, no platform detection). All changes are browser-runtime TypeScript, module-level `.ts` helper files, i18n strings, and Markdown. Runs identically on every OS the browser runs on. CI already runs on Ubuntu; the driving developer machine is Windows and no Windows-specific code is added.
