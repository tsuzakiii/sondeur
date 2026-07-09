import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureExceptionMock, getServiceSupabaseMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  getServiceSupabaseMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

vi.mock("@/lib/stripe", () => ({
  getServiceSupabase: () => getServiceSupabaseMock(),
}));

import { releaseCheckoutLock, tryAcquireCheckoutLock } from "@/lib/checkoutLock";

beforeEach(() => {
  captureExceptionMock.mockReset();
  getServiceSupabaseMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("tryAcquireCheckoutLock (AC-#15-2)", () => {
  it("(a) client returns token → returns token", async () => {
    const rpc = vi.fn(async () => ({ data: "tok-abc", error: null }));
    getServiceSupabaseMock.mockReturnValue({ rpc });
    expect(await tryAcquireCheckoutLock("uid-1")).toBe("tok-abc");
    expect(rpc).toHaveBeenCalledWith("try_acquire_checkout_lock", { p_user_id: "uid-1" });
  });

  it("(b) client returns { data: null, error: null } → returns null", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    getServiceSupabaseMock.mockReturnValue({ rpc });
    expect(await tryAcquireCheckoutLock("uid-1")).toBeNull();
  });

  it("(c) getServiceSupabase() returns null → 'unavailable', no RPC attempted", async () => {
    getServiceSupabaseMock.mockReturnValue(null);
    expect(await tryAcquireCheckoutLock("uid-1")).toBe("unavailable");
    // RPC は呼ばれていない (呼びようがない)
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("(d) client returns error → returns null, Sentry called", async () => {
    const err = new Error("db down");
    const rpc = vi.fn(async () => ({ data: null, error: err }));
    getServiceSupabaseMock.mockReturnValue({ rpc });
    expect(await tryAcquireCheckoutLock("uid-1")).toBeNull();
    expect(captureExceptionMock).toHaveBeenCalledWith(err);
  });
});

describe("releaseCheckoutLock (AC-#15-2)", () => {
  it("(e) release with matching token → RPC called, resolves", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    getServiceSupabaseMock.mockReturnValue({ rpc });
    await expect(releaseCheckoutLock("uid-1", "tok-abc")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("release_checkout_lock", {
      p_user_id: "uid-1",
      p_token: "tok-abc",
    });
  });

  it("(f) release with service client error → resolves, Sentry called", async () => {
    const err = new Error("db down");
    const rpc = vi.fn(async () => ({ data: null, error: err }));
    getServiceSupabaseMock.mockReturnValue({ rpc });
    await expect(releaseCheckoutLock("uid-1", "tok-abc")).resolves.toBeUndefined();
    expect(captureExceptionMock).toHaveBeenCalledWith(err);
  });

  it("release when service client is null → no-op resolve", async () => {
    getServiceSupabaseMock.mockReturnValue(null);
    await expect(releaseCheckoutLock("uid-1", "tok-abc")).resolves.toBeUndefined();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
