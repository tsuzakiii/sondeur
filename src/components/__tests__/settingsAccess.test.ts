import { beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ path: "/settings/general", kind: "signedOut", ready: true }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/authState", () => ({ useAuthInfo: () => ({ kind: state.kind, userId: "owner", email: "owner@example.com" }), useAuthReady: () => state.ready }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import SettingsShell from "@/components/settings/SettingsShell";
import AuthFooter from "@/components/AuthFooter";
beforeEach(() => { state.kind = "signedOut"; state.path = "/settings/general"; state.ready = true; });
const render = () => renderToStaticMarkup(createElement(SettingsShell, null, "PAGE_CONTENT"));
it("guests see general preferences only", () => {
  const html = render();
  expect(html).toContain('href="/settings/general"');
  expect(html).not.toContain('href="/settings/account"');
  expect(html).not.toContain('href="/settings/billing"');
  expect(html).toContain("PAGE_CONTENT");
});
it.each(["/settings/account", "/settings/billing"])("hides restricted content at %s before and after guest auth resolves", path => {
  state.path = path;
  state.ready = false;
  expect(render()).not.toContain("PAGE_CONTENT");
  state.ready = true;
  expect(render()).not.toContain("PAGE_CONTENT");
});
it("signed-in users retain all three settings sections", () => {
  state.kind = "signedIn";
  state.path = "/settings/account";
  const html = render();
  expect(html).toContain('href="/settings/account"');
  expect(html).toContain('href="/settings/billing"');
  expect(html).toContain("PAGE_CONTENT");
});
it("guest sign-in entry is independent of account settings", () => {
  const html = renderToStaticMarkup(createElement(AuthFooter));
  expect(html).toContain('href="/login"');
  expect(html).not.toContain('/settings/account');
  expect(html).not.toContain('settings.guest');
});
