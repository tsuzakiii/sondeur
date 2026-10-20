// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { I18nProvider, useI18n } from "../i18n";
import { initialRequestLocale, LOCALE_STORAGE, type Locale } from "../localeConfig";
import { pendingAccountLocale, stageAccountLocale, syncAccountLocale } from "../localeSync";

const mocks = vi.hoisted(() => ({
  owner: "user",
  getSupabase: vi.fn(),
}));
vi.mock("../authState", () => ({
  useAuthInfo: () => ({ kind: "signedIn", userId: mocks.owner }),
  useAuthReady: () => true,
  getSignedInUserId: () => mocks.owner,
}));
vi.mock("../supabase/client", () => ({ getSupabase: mocks.getSupabase }));

let root: Root | undefined;
let container: HTMLDivElement;
let state: ReturnType<typeof useI18n>;
let dbLocale: Locale;
let failSave: boolean;
let delaySave: (() => Promise<void>) | undefined;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let writes: Locale[];

function Probe() {
  const current = useI18n();
  useEffect(() => { state = current; }, [current]);
  return createElement("span", null, current.t("settings.title"));
}

async function mount() {
  const cookie = document.cookie.match(/(?:^|; )sondeur_locale=(en|ja)/)?.[1];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(I18nProvider, {
      initialLocale: initialRequestLocale(cookie, "en-US"),
      hasSavedLocale: Boolean(cookie),
    }, createElement(Probe)));
  });
  await waitFor(() => expect(state.ready).toBe(true));
}

async function unmount() {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
}

async function choose(locale: Locale) {
  await act(async () => state.setLocale(locale));
}

async function waitFor(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assertion();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.owner = crypto.randomUUID();
  localStorage.clear();
  document.cookie = "sondeur_locale=; Max-Age=0; Path=/";
  dbLocale = "en";
  failSave = false;
  delaySave = undefined;
  writes = [];
  // Use the actual Supabase/PostgREST builder. A plain resolved-Promise mock
  // would miss the original bug: rpc() does not send until awaited.
  fetchMock = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).includes("/rpc/update_locale")) {
      const locale = JSON.parse(init!.body as string).p_locale as Locale;
      writes.push(locale);
      await delaySave?.();
      if (failSave) return new Response(JSON.stringify({ message: "offline" }), { status: 503 });
      dbLocale = locale;
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ locale: dbLocale }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  });
  mocks.getSupabase.mockReturnValue(createClient("https://example.supabase.co", "test-key", {
    global: { fetch: fetchMock },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
});
afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

it("sends the language write and keeps Japanese after reloading with the account preference", async () => {
  await mount();
  await choose("ja");
  await waitFor(() => expect(dbLocale).toBe("ja"));
  expect(writes).toEqual(["ja"]);
  expect(localStorage.getItem(LOCALE_STORAGE)).toBe("ja");
  expect(document.cookie).toContain("sondeur_locale=ja");
  await unmount();
  await mount();
  expect(container.textContent).toBe("設定");
  expect(state.locale).toBe("ja");
});

it("keeps a failed choice across a remount, then retries it instead of loading stale English", async () => {
  await mount();
  failSave = true;
  await choose("ja");
  await waitFor(() => expect(state.localeSaveFailed).toBe(true));
  expect(dbLocale).toBe("en");
  const userId = mocks.owner;
  expect(pendingAccountLocale(userId)).toBe("ja");
  expect(localStorage.getItem(`sondeur.locale.pending.${userId}`)).toContain('"locale":"ja"');
  await unmount();
  failSave = false;
  fetchMock.mockClear();
  await mount();
  await waitFor(() => expect(dbLocale).toBe("ja"));
  expect(state.locale).toBe("ja");
  expect(state.localeSaveFailed).toBe(false);
  expect(pendingAccountLocale(userId)).toBeNull();
  expect(fetchMock.mock.calls.every(([url]) => String(url).includes("/rpc/update_locale"))).toBe(true);
});

it("restores a persisted unfinished write after a reload even without an in-memory choice", async () => {
  localStorage.setItem(`sondeur.locale.pending.${mocks.owner}`, JSON.stringify({ locale: "ja", revision: "before-reload" }));
  document.cookie = "sondeur_locale=ja; Path=/";
  await mount();
  await waitFor(() => expect(dbLocale).toBe("ja"));
  expect(state.locale).toBe("ja");
  expect(localStorage.getItem(`sondeur.locale.pending.${mocks.owner}`)).toBeNull();
});

it("serializes rapid changes so the last choice wins", async () => {
  await mount();
  let finish!: () => void;
  const delayed = new Promise<void>(resolve => { finish = resolve; });
  delaySave = () => delayed;
  await choose("ja");
  await waitFor(() => expect(writes).toEqual(["ja"]));
  await choose("en");
  expect(writes).toEqual(["ja"]);
  await act(async () => { finish(); });
  await waitFor(() => expect(pendingAccountLocale(mocks.owner)).toBeNull());
  expect(writes).toEqual(["ja", "en"]);
  expect(dbLocale).toBe("en");
  expect(state.locale).toBe("en");
});

it("does not replay one account's pending language into another account", async () => {
  const previousUser = mocks.owner;
  stageAccountLocale(previousUser, "ja");
  mocks.owner = "another-account";
  expect(await syncAccountLocale(previousUser)).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(pendingAccountLocale(previousUser)).toBe("ja");
  await mount();
  expect(state.locale).toBe("en");
  expect(writes).toEqual([]);
});

it("retries pending saves when the browser comes back online", async () => {
  await mount();
  failSave = true;
  await choose("ja");
  await waitFor(() => expect(state.localeSaveFailed).toBe(true));
  failSave = false;
  await act(async () => { window.dispatchEvent(new Event("online")); });
  await waitFor(() => expect(state.localeSaveFailed).toBe(false));
  expect(dbLocale).toBe("ja");
});
