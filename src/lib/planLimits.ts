import type { SupabaseClient, User } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";

/**
 * プラン制限: ノード生成数の総量制。
 * 木の形 (深さ/分岐) は自由で、生成したノードの数だけを数える。
 */

/**
 * 月間ノード生成上限。
 * 検索付き生成は実測で最大 $0.0227/node 程度。上限フル消費でも粗利が残る線にしている。
 */
export const PLAN_NODE_LIMITS: Record<string, number | null> = {
  free: 20,
  standard: 100,
  pro: 300,
};

/** 未ログインのお試し枠 (クライアント側ゲートで使用。合計ノード数) */
export const GUEST_NODE_LIMIT = 10;

export interface LimitCheck {
  ok: boolean;
  /** ユーザー向けメッセージ (ok=false のとき) */
  reason?: string;
}

/**
 * ノード生成枠を1消費する。SECURITY DEFINER 関数でアトミックに行うため、
 * クライアントからのカウンタ改ざんはできない。
 */
export async function consumeNodeQuota(
  supabase: SupabaseClient,
  user: User
): Promise<LimitCheck> {
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  if (pErr) {
    console.error("[limits] profile read failed", pErr);
    Sentry.captureException(pErr); // fail-openなので実際の失敗頻度を監視する
    return { ok: true }; // 計測失敗でユーザーを止めない
  }
  const plan = profile?.plan ?? "free";
  const limit = plan in PLAN_NODE_LIMITS ? PLAN_NODE_LIMITS[plan] : PLAN_NODE_LIMITS.free;
  if (limit === null) return { ok: true };

  const { data: allowed, error } = await supabase.rpc("consume_node_quota", { p_limit: limit });
  if (error) {
    console.error("[limits] quota consume failed", error);
    Sentry.captureException(error); // fail-openなので実際の失敗頻度を監視する
    return { ok: true };
  }
  if (!allowed) {
    const upgradeHint =
      plan === "free"
        ? "アップグレードで枠が広がります。"
        : plan === "standard"
          ? "Proプランで枠が広がります。"
          : "";
    return {
      ok: false,
      reason: `今月のノード生成上限 (${limit}個) に達しました。来月リセットされます。${upgradeHint}`,
    };
  }
  return { ok: true };
}
