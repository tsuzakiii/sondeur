import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ callback: null as null | ((event: string, session: { user: { id: string; email: string } } | null) => void), configured: true }));
vi.mock("react", () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabase: () => mock.configured ? { auth: { onAuthStateChange: (callback: typeof mock.callback) => { mock.callback = callback; } } } : null }));
vi.mock("@/lib/sync", () => ({ startSync: vi.fn(), stopSync: vi.fn() }));
vi.mock("@/components/authFooterCache", () => ({ clearAllCachedProfiles: vi.fn() }));
beforeEach(() => { vi.resetModules(); mock.configured = true; mock.callback = null; });
it("waits for initial guest session resolution", async () => {
  const auth = await import("../authState");
  auth.initAuth();
  expect(auth.useAuthReady()).toBe(false);
  mock.callback!("INITIAL_SESSION", null);
  expect(auth.useAuthReady()).toBe(true);
  expect(auth.useAuthInfo().kind).toBe("signedOut");
});
it("restores a signed-in session before marking ready", async () => {
  const auth = await import("../authState");
  auth.initAuth();
  mock.callback!("INITIAL_SESSION", { user: { id: "owner", email: "owner@example.com" } });
  expect(auth.useAuthReady()).toBe(true);
  expect(auth.useAuthInfo().kind).toBe("signedIn");
  mock.callback!("SIGNED_OUT", null);
  expect(auth.useAuthReady()).toBe(true);
  expect(auth.useAuthInfo().kind).toBe("signedOut");
});
it("local-only mode does not wait for a nonexistent auth client", async () => {
  mock.configured = false;
  const auth = await import("../authState");
  auth.initAuth();
  expect(auth.useAuthReady()).toBe(true);
});
