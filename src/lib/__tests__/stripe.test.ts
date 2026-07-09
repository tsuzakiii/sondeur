import { afterEach, describe, expect, it, vi } from "vitest";
import { isStripeConfigured, planFromPriceId, priceIdForPlan } from "@/lib/stripe";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Stripe plan mapping", () => {
  it("maps configured Price IDs to plans", () => {
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_live");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_live");

    expect(planFromPriceId("price_standard_live")).toBe("standard");
    expect(planFromPriceId("price_pro_live")).toBe("pro");
    expect(planFromPriceId("price_unknown")).toBeNull();
  });

  it("returns the configured Price ID for each paid plan", () => {
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_live");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_live");

    expect(priceIdForPlan("standard")).toBe("price_standard_live");
    expect(priceIdForPlan("pro")).toBe("price_pro_live");
  });

  it("treats Stripe as configured only when a secret key exists", () => {
    expect(isStripeConfigured()).toBe(false);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_dummy");
    expect(isStripeConfigured()).toBe(true);
  });
});
