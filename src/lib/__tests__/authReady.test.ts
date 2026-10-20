import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ callback: null as null | ((event: string, session: { user: { id: string; email: string; user_metadata?: Record<string, unknown> } } | null) => void), configured: true, updateUser: vi.fn() }));
vi.mock("react", () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabase: () => mock.configured ? { auth: { updateUser: mock.updateUser, onAuthStateChange: (callback: typeof mock.callback) => { mock.callback = callback; } } } : null }));
vi.mock("@/lib/sync", () => ({ startSync: vi.fn(), stopSync: vi.fn() }));
vi.mock("@/components/authFooterCache", () => ({ clearAllCachedProfiles: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); mock.configured = true; mock.callback = null; });
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

it("retries failed Trail loading on renewed auth without reloading on every event", async () => {
  const auth = await import("../authState");
  const sync = await import("../sync");
  const status = await import("../syncStatus");
  const session = { user: { id: "owner", email: "owner@example.com" } };
  auth.initAuth();
  mock.callback!("INITIAL_SESSION", session);
  expect(sync.startSync).toHaveBeenCalledTimes(1);
  status.setSyncStatus("ready");
  mock.callback!("TOKEN_REFRESHED", session);
  expect(sync.startSync).toHaveBeenCalledTimes(1);
  status.setSyncStatus("error");
  mock.callback!("TOKEN_REFRESHED", session);
  expect(sync.startSync).toHaveBeenCalledTimes(2);
});
it("loads account preferences and updates them without restarting Trail sync", async () => {
  const auth = await import("../authState");
  const sync = await import("../sync");
  auth.initAuth();
  mock.callback!("INITIAL_SESSION", { user: { id: "a", email: "a@example.com", user_metadata: { sondeur_interests: ["space"] } } });
  expect(auth.useAuthInfo()).toMatchObject({ interests: ["space"] });
  mock.callback!("USER_UPDATED", { user: { id: "a", email: "a@example.com", user_metadata: { sondeur_interests: ["history"] } } });
  expect(auth.useAuthInfo()).toMatchObject({ interests: ["history"] });
  expect(sync.startSync).toHaveBeenCalledTimes(1);
  mock.callback!("SIGNED_IN", { user: { id: "b", email: "b@example.com" } });
  expect(auth.useAuthInfo()).toMatchObject({ userId: "b", interests: [] });
});
it("only confirms preference saves returned for the currently signed-in account", async () => {
  const auth = await import("../authState");
  auth.initAuth();
  mock.callback!("INITIAL_SESSION", { user: { id: "a", email: "a@example.com" } });
  mock.updateUser.mockResolvedValue({ data: { user: { id: "a", user_metadata: { sondeur_interests: ["space"] } } }, error: null });
  expect(await auth.saveAccountInterests("a", ["space"])).toBe(true);
  expect(mock.updateUser).toHaveBeenCalledWith({ data: { sondeur_interests: ["space"] } });
  expect(auth.useAuthInfo()).toMatchObject({ interests: ["space"] });
  mock.updateUser.mockResolvedValue({ data: {}, error: new Error("offline") });
  expect(await auth.saveAccountInterests("a", ["history"])).toBe(false);
  expect(auth.useAuthInfo()).toMatchObject({ interests: ["space"] });
  expect(await auth.saveAccountInterests("b", ["history"])).toBe(false);
});
