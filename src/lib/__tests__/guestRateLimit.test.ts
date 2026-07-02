import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const rpcMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

import { checkGuestRateLimit, getClientIp } from "@/lib/guestRateLimit";

describe("getClientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://x", { headers });

  it("x-forwarded-for の先頭 IP を返す", () => {
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
  });

  it("x-forwarded-for が無ければ x-real-ip", () => {
    expect(getClientIp(req({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("どちらも無ければ unknown", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });
});

describe("checkGuestRateLimit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    rpcMock.mockReset();
  });

  it("Supabase 未設定なら fail-open (true)", async () => {
    // env 未設定のまま → getServiceClient() が null
    expect(await checkGuestRateLimit("1.2.3.4")).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RPC が false を返したら拒否", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "dummy");
    rpcMock.mockResolvedValue({ data: false, error: null });
    expect(await checkGuestRateLimit("1.2.3.4")).toBe(false);
  });

  it("RPC が true を返したら許可、IP は SHA-256 ハッシュで渡される", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    expect(await checkGuestRateLimit("1.2.3.4")).toBe(true);
    const args = rpcMock.mock.calls[0];
    expect(args[0]).toBe("consume_guest_quota");
    expect(args[1].p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(args[1].p_ip_hash).not.toContain("1.2.3.4");
  });

  it("RPC エラーは fail-open (true)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await checkGuestRateLimit("1.2.3.4")).toBe(true);
  });
});
