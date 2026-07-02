import { describe, expect, it } from "vitest";
import { dicts } from "@/lib/i18n";

/** en/ja 辞書のキー網羅性 — 片方にしか無いキーは fallback で英語が混ざる事故になる */
describe("i18n dictionaries", () => {
  it("ja に en の全キーがある", () => {
    const missing = Object.keys(dicts.en).filter((k) => !(k in dicts.ja));
    expect(missing).toEqual([]);
  });

  it("en に ja の全キーがある", () => {
    const missing = Object.keys(dicts.ja).filter((k) => !(k in dicts.en));
    expect(missing).toEqual([]);
  });

  it("プレースホルダ ({var}) が en/ja で一致する", () => {
    const vars = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
    const mismatched = Object.keys(dicts.en).filter(
      (k) => k in dicts.ja && vars(dicts.en[k]).join(",") !== vars(dicts.ja[k]).join(",")
    );
    expect(mismatched).toEqual([]);
  });

  it("空文字の翻訳がない", () => {
    for (const locale of ["en", "ja"] as const) {
      const empty = Object.entries(dicts[locale]).filter(([, v]) => v.trim() === "");
      expect(empty).toEqual([]);
    }
  });
});
