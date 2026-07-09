import { describe, expect, it } from "vitest";
import { pickPlanMode } from "@/components/authFooterMode";

describe("pickPlanMode (AC-M3-5)", () => {
  it("(a) new free user (no Stripe customer) → upgrade", () => {
    expect(pickPlanMode("free", false)).toBe("upgrade");
  });

  it("(b) downgraded former subscriber (free + Stripe customer) → recover", () => {
    expect(pickPlanMode("free", true)).toBe("recover");
  });

  it("(c) standard subscriber → manage", () => {
    expect(pickPlanMode("standard", true)).toBe("manage");
  });

  it("(d) paid plan without Stripe customer defensively still maps to manage", () => {
    // 行の不整合ケース。Portal 呼び出し側で診断されるべきで、ここでは UI 分岐だけ確定させる。
    expect(pickPlanMode("pro", false)).toBe("manage");
  });

  it("(e) unknown / null plan defaults to upgrade (new free)", () => {
    expect(pickPlanMode(null, false)).toBe("upgrade");
    expect(pickPlanMode(undefined, false)).toBe("upgrade");
  });

  it("null plan with hasStripe still maps to recover (edge, but consistent)", () => {
    expect(pickPlanMode(null, true)).toBe("recover");
  });
});
