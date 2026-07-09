import { describe, expect, it } from "vitest";
import { checkoutIdempotencyKey } from "@/lib/idempotencyKey";

describe("checkoutIdempotencyKey (AC-M2-2)", () => {
  it("(a) same user+plan+price+hasStripe → same key (deterministic)", () => {
    expect(checkoutIdempotencyKey("u1", "standard", "price_a", false)).toBe(
      checkoutIdempotencyKey("u1", "standard", "price_a", false)
    );
  });

  it("(b) different plan → different key", () => {
    expect(checkoutIdempotencyKey("u1", "standard", "price_a", false)).not.toBe(
      checkoutIdempotencyKey("u1", "pro", "price_a", false)
    );
  });

  it("(c) different user → different key", () => {
    expect(checkoutIdempotencyKey("u1", "standard", "price_a", false)).not.toBe(
      checkoutIdempotencyKey("u2", "standard", "price_a", false)
    );
  });

  it("(d) rotated priceId → different key", () => {
    expect(checkoutIdempotencyKey("u1", "standard", "price_a", false)).not.toBe(
      checkoutIdempotencyKey("u1", "standard", "price_b", false)
    );
  });

  it("(e) hasStripe bit flip → different key (avoids Stripe parameter conflict when customer_id gets populated)", () => {
    expect(checkoutIdempotencyKey("u1", "standard", "price_a", false)).not.toBe(
      checkoutIdempotencyKey("u1", "standard", "price_a", true)
    );
  });

  it("returns the documented template exactly", () => {
    expect(checkoutIdempotencyKey("u1", "standard", "price_a", true)).toBe(
      "checkout:u1:standard:price_a:c"
    );
    expect(checkoutIdempotencyKey("u1", "standard", "price_a", false)).toBe(
      "checkout:u1:standard:price_a:e"
    );
  });
});
