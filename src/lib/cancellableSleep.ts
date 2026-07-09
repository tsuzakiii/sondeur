// awaitable sleep that can be cancelled synchronously. cancel() both clears the
// pending setTimeout AND resolves the promise so any pending `await` unblocks.
// If cancel() is called after the timer has already fired, it is a no-op.
// See docs/fix-mixed-cleanups.md (L1) for the design rationale.

export type CancellableSleep = {
  promise: Promise<void>;
  cancel: () => void;
};

export function createCancellableSleep(ms: number): CancellableSleep {
  let settled = false;
  let handle: number | undefined;
  let resolveFn: () => void = () => {};

  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve;
    handle = window.setTimeout(() => {
      settled = true;
      resolve();
    }, ms);
  });

  const cancel = () => {
    if (settled) return;
    settled = true;
    if (handle !== undefined) window.clearTimeout(handle);
    resolveFn();
  };

  return { promise, cancel };
}
