import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), stripe: vi.fn(), create: vi.fn(), profile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getRequestUser: mocks.user }));
vi.mock("@/lib/stripe", () => ({ getStripe: mocks.stripe }));
import { POST } from "./route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.stripe.mockReturnValue({ billingPortal: { sessions: { create: mocks.create } } });
  const query = { select: () => query, eq: () => query, single: mocks.profile };
  mocks.user.mockResolvedValue({ user: { id: "owner" }, supabase: { from: () => query } });
});
it("uses the authenticated customer's portal and returns to settings", async () => {
  mocks.profile.mockResolvedValue({ data: { stripe_customer_id: "cus_owner", plan: "standard" } });
  mocks.create.mockResolvedValue({ url: "https://billing.stripe.com/test" });
  const res = await POST(new Request("https://sondeur.app/api/billing/portal", { method: "POST", body: JSON.stringify({ customer: "cus_attacker" }) }));
  expect(res.status).toBe(200);
  expect(mocks.create).toHaveBeenCalledWith({ customer: "cus_owner", return_url: "https://sondeur.app/settings/billing" });
});
it("does not create a portal for a signed-out request", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await POST(new Request("https://sondeur.app/api/billing/portal"))).status).toBe(401);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("fails closed when a paid profile lacks a Stripe customer", async () => {
  mocks.profile.mockResolvedValue({ data: { stripe_customer_id: null, plan: "standard" } });
  expect((await POST(new Request("https://sondeur.app/api/billing/portal"))).status).toBe(409);
  expect(mocks.create).not.toHaveBeenCalled();
});
