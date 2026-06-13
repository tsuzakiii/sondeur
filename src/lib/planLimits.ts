import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * プラン制限: ノード生成数の総量制。
 * 木の形 (深さ/分岐) は自由で、生成したノードの数だけを数える。
 */

/** 月間ノード生成上限 (null = 無制限)。free 30 ≈ 上限フル消費で月¥25〜45 の原価 */
export const PLAN_NODE_LIMITS: Record<string, number | null> = {
  free: 30,
  standard: null,
  pro: null,
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
    return { ok: true }; // 計測失敗でユーザーを止めない
  }
  const limit = PLAN_NODE_LIMITS[profile?.plan ?? "free"] ?? PLAN_NODE_LIMITS.free;
  if (limit === null) return { ok: true };

  const { data: allowed, error } = await supabase.rpc("consume_node_quota", { p_limit: limit });
  if (error) {
    console.error("[limits] quota consume failed", error);
    return { ok: true };
  }
  if (!allowed) {
    return {
      ok: false,
      reason: `Freeプランの今月のノード生成上限 (${limit}個) に達しました。来月リセットされます。アップグレードで無制限になります。`,
    };
  }
  return { ok: true };
}
