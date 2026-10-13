import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { GET } from "./route";

vi.mock("@supabase/ssr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/ssr")>()),
  createServerClient: vi.fn(),
}));

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  vi.mocked(createServerClient).mockReturnValue({
    auth: { verifyOtp, exchangeCodeForSession },
  } as unknown as ReturnType<typeof createServerClient>);
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("production email callback", () => {
  it("verifies token hashes and sends the session cookie on an uncached redirect", async () => {
    verifyOtp.mockImplementation(async () => {
      const options = vi.mocked(createServerClient).mock.calls[0][2];
      expect(options.cookies.getAll?.()).toEqual([{ name: "existing", value: "cookie" }]);
      await options.cookies.setAll?.([
        { name: "sb-session", value: "test-session", options: { path: "/", httpOnly: true } },
      ], {});
      return { error: null };
    });
    const res = await GET(new Request("https://sondeur.app/auth/confirm?token_hash=valid&type=email", {
      headers: { cookie: "existing=cookie" },
    }));
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "valid" });
    expect(res.headers.get("location")).toBe("https://sondeur.app/");
    expect(res.cookies.get("sb-session")?.value).toBe("test-session");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("keeps PKCE compatibility for old email templates", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await GET(new Request("https://sondeur.app/auth/confirm?code=pkce-code"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://sondeur.app/");
  });

  it("redirects expired links to the localized error notice", async () => {
    verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
    const res = await GET(new Request("https://sondeur.app/auth/confirm?token_hash=expired&type=email"));
    expect(res.headers.get("location")).toBe("https://sondeur.app/?auth_error=otp_expired");
    expect(res.cookies.getAll()).toHaveLength(0);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("reports missing tokens without contacting Auth", async () => {
    const res = await GET(new Request("https://sondeur.app/auth/confirm"));
    expect(res.headers.get("location")).toBe("https://sondeur.app/?auth_error=missing_token");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("reports a missing configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const res = await GET(new Request("https://sondeur.app/auth/confirm?code=x"));
    expect(res.headers.get("location")).toBe("https://sondeur.app/?auth_error=not_configured");
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
