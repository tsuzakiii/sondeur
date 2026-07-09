// AuthFooter の plan bar 分岐を決める。webhook が subscription を canceled / unpaid /
// incomplete_expired で downgrade すると profile は `{ plan: "free", stripe_customer_id: <cus> }`
// になるが、この状態は「payment recovery」= Portal に流したい。一方の新規 Free ユーザーは
// Upgrade UI を出したい。両者を hasStripe bit で分ける。詳細は docs/fix-unpaid-portal-button.md。

export type PlanMode = "upgrade" | "recover" | "manage";

export function pickPlanMode(plan: string | null | undefined, hasStripe: boolean): PlanMode {
  const p = plan ?? "free";
  if (p !== "free") return "manage";
  return hasStripe ? "recover" : "upgrade";
}
