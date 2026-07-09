import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCancellableSleep } from "@/lib/cancellableSleep";

beforeEach(() => {
  // window.setTimeout / clearTimeout を fake timer に接続するため、vi.stubGlobal で
  // window 自体を globalThis に向ける (fake timer は globalThis の setTimeout を hijack する)。
  vi.stubGlobal("window", globalThis);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createCancellableSleep", () => {
  it("resolves after ms when not cancelled (a)", async () => {
    const { promise } = createCancellableSleep(1500);
    let resolved = false;
    void promise.then(() => { resolved = true; });
    // 1499ms 進める → まだ resolve していない
    await vi.advanceTimersByTimeAsync(1499);
    expect(resolved).toBe(false);
    // ms を超える → resolve
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  it("cancel() before fire resolves promise synchronously and prevents the timer callback (b)", async () => {
    const before = vi.getTimerCount();
    const { promise, cancel } = createCancellableSleep(1500);
    // timer が 1 個増えている
    expect(vi.getTimerCount()).toBe(before + 1);
    let resolved = false;
    void promise.then(() => { resolved = true; });
    cancel();
    // microtask 消化
    await Promise.resolve();
    expect(resolved).toBe(true);
    // cancel 後 timer は消えている
    expect(vi.getTimerCount()).toBe(before);
    // さらに時間を進めても副作用なし
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.getTimerCount()).toBe(before);
  });

  it("cancel() after the timer already fired is a no-op (c)", async () => {
    const { promise, cancel } = createCancellableSleep(500);
    let resolved = false;
    void promise.then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(true);
    // fire 後の cancel は throw しない
    expect(() => cancel()).not.toThrow();
  });
});
