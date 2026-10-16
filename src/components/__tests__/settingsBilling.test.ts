import { beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ auth: { kind: "signedIn", userId: "owner", email: "owner@example.com" }, profile: { plan: "free", used: 4, hasStripe: false }, failed: false, ready: true }));
vi.mock("@/lib/authState", () => ({ useAuthInfo: () => state.auth }));
vi.mock("@/lib/useBillingProfile", () => ({ useBillingProfile: () => ({ profile: state.profile, failed: state.failed, ready: state.ready, slowNote: false, retry: vi.fn() }) }));
vi.mock("@/lib/store", () => ({ useTreeStore: () => ({ trees: {} }) }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import BillingSettings from "@/app/settings/billing/page";
beforeEach(() => { state.auth.kind = "signedIn"; state.profile = { plan: "free", used: 4, hasStripe: false }; state.failed = false; state.ready = true; });
const render = () => renderToStaticMarkup(createElement(BillingSettings));
it("offers checkout only to a verified free account without Stripe history", () => {
  expect(render()).toContain("settings.choose");
  state.ready = false;
  expect(render()).not.toContain("settings.choose");
});
it("keeps paid and recovery accounts on the portal path", () => {
  state.profile.plan = "standard"; state.profile.hasStripe = true;
  const paid = render();
  expect(paid).toContain("settings.cancel");
  expect(paid).not.toContain("settings.choose");
  state.profile.plan = "free";
  const recovery = render();
  expect(recovery).toContain("settings.recoverHelp");
  expect(recovery).not.toContain("settings.choose");
});
it("blocks billing actions after a profile fetch failure", () => {
  state.failed = true;
  expect(render()).toContain("settings.loadFailed");
  expect(render()).not.toContain("settings.choose");
});
it("signed-out visitors get an account link, no billing action", () => {
  state.auth.kind = "signedOut";
  expect(render()).toContain('/login');
  expect(render()).not.toContain("settings.choose");
  expect(render()).not.toContain("settings.cancel");
});
