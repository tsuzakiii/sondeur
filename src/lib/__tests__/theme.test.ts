import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { normalizeTheme, resolveTheme, THEME_INIT_SCRIPT } from "../themeConfig";

describe("theme preferences", () => {
  it("follows OS appearance only in system mode", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(normalizeTheme("unexpected")).toBe("system");
  });
  it.each([
    ["dark", false, "dark"], ["light", true, "light"], [null, true, "dark"], ["invalid", false, "light"],
  ])("applies stored %s before hydration", (stored, osDark, expected) => {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    runInNewContext(THEME_INIT_SCRIPT, { document, localStorage: { getItem: () => stored }, matchMedia: () => ({ matches: osDark }) });
    expect(document.documentElement.dataset.theme).toBe(expected);
  });
  it("still renders when browser storage is blocked", () => {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    runInNewContext(THEME_INIT_SCRIPT, { document, localStorage: { getItem: () => { throw new Error("blocked"); } }, matchMedia: () => ({ matches: true }) });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
