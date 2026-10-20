import { expect, it, vi, afterEach } from "vitest";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { initialRequestLocale, localeBootstrapScript, persistLocale } from "../localeConfig";
import { I18nProvider, useI18n } from "../i18n";

afterEach(() => vi.unstubAllGlobals());

it("uses the saved choice before the browser's preferred language", () => {
  expect(initialRequestLocale("ja", "en-US,en;q=0.9")).toBe("ja");
  expect(initialRequestLocale("en", "ja-JP")).toBe("en");
  expect(initialRequestLocale(undefined, "ja-JP, en;q=0.8")).toBe("ja");
  expect(initialRequestLocale("bad", "en;q=0.4,ja;q=0.9")).toBe("ja");
  expect(initialRequestLocale(null, "ja;q=0,en")).toBe("en");
  expect(initialRequestLocale(null, "fr-FR")).toBe("en");
});

function LanguageProbe() {
  const { t } = useI18n();
  return createElement("span", null, t("settings.title"));
}
it("renders saved Japanese in the server HTML, without an English first render", () => {
  const html = renderToStaticMarkup(createElement(I18nProvider, {
    initialLocale: "ja", hasSavedLocale: true,
  }, createElement(LanguageProbe)));
  expect(html).toContain("設定");
  expect(html).not.toContain("Settings");
});
it("renders English when it is the explicit preference", () => {
  const html = renderToStaticMarkup(createElement(I18nProvider, {
    initialLocale: "en", hasSavedLocale: true,
  }, createElement(LanguageProbe)));
  expect(html).toContain("Settings");
});
it("hides only mismatched legacy translations before first paint", () => {
  const root = { lang: "en", dataset: {} as Record<string, string> };
  runInNewContext(localeBootstrapScript(false), {
    localStorage: { getItem: () => "ja" }, document: { documentElement: root },
  });
  expect(root.dataset.localePending).toBe("ja");
  const matching = { lang: "ja", dataset: {} };
  runInNewContext(localeBootstrapScript(false), {
    localStorage: { getItem: () => "ja" }, document: { documentElement: matching },
  });
  expect(matching.dataset).toEqual({});
});
it("does not mask the page when storage is blocked or a cookie already supplies the language", () => {
  const root = { lang: "ja", dataset: {} };
  runInNewContext(localeBootstrapScript(false), {
    localStorage: { getItem: () => { throw new Error("blocked"); } }, document: { documentElement: root },
  });
  expect(root.dataset).toEqual({});
  expect(localeBootstrapScript(true)).toBe("");
});
it("persists a server-readable language even when localStorage is blocked", () => {
  const doc = { cookie: "" };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", { location: { protocol: "https:" }, localStorage: { setItem: () => { throw new Error("blocked"); } } });
  persistLocale("ja");
  expect(doc.cookie).toBe("sondeur_locale=ja; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
});
