import { beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const request = vi.hoisted(() => ({ saved: "ja" as string | undefined, language: "en-US" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => request.saved ? { value: request.saved } : undefined }),
  headers: async () => new Headers({ "accept-language": request.language }),
}));
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist" }), Geist_Mono: () => ({ variable: "mono" }),
  Noto_Sans_JP: () => ({ variable: "noto" }),
}));
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => null }));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => null }));
import RootLayout from "./layout";
import { useI18n } from "@/lib/i18n";
function Probe() { return createElement("p", null, useI18n().t("settings.title")); }
beforeEach(() => { request.saved = "ja"; request.language = "en-US"; });

it("passes the cookie language through the actual layout to both HTML lang and translated content", async () => {
  const html = renderToStaticMarkup(await RootLayout({ children: createElement(Probe) }));
  expect(html).toContain('<html lang="ja"');
  expect(html).toContain("<p>設定</p>");
  expect(html).not.toContain("<p>Settings</p>");
});
it("uses the browser language on a first visit without a cookie", async () => {
  request.saved = undefined;
  request.language = "ja-JP,en;q=0.8";
  const html = renderToStaticMarkup(await RootLayout({ children: createElement(Probe) }));
  expect(html).toContain('<html lang="ja"');
  expect(html).toContain("<p>設定</p>");
});
