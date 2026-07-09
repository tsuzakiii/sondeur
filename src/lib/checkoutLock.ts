// per-user checkout lock。#15 / docs/fix-checkout-atomic-lock.md 参照。
// tryAcquire: 60s TTL 内の race loser には null を返す。
// "unavailable" (fail-CLOSED) を返す条件は 2 つ:
//   1) 環境未設定 (SUPABASE_SECRET_KEY なしで service client が null)
//   2) RPC error (review-r1 B2: migration 未適用 / DB 障害を race loser と区別)
// route はどちらも 503 にマップして operator が silent misconfig に気付ける。

import * as Sentry from "@sentry/nextjs";
import { getServiceSupabase } from "@/lib/stripe";

export type AcquireResult = string | null | "unavailable";

export async function tryAcquireCheckoutLock(userId: string): Promise<AcquireResult> {
  const supabase = getServiceSupabase();
  if (!supabase) return "unavailable";
  try {
    const { data, error } = await supabase.rpc("try_acquire_checkout_lock", {
      p_user_id: userId,
    });
    // review-r1 B2: RPC error は race loser と区別して "unavailable" を返す。
    // migration 未適用 (RPC not found) や DB 障害を 409 "checkout in progress" と
    // 誤ってユーザーに見せると operator が silent misconfig に気付けない。route は
    // "unavailable" を 503 にマップする。
    if (error) {
      Sentry.captureException(error);
      return "unavailable";
    }
    if (typeof data === "string" && data.length > 0) return data;
    return null;
  } catch (e) {
    Sentry.captureException(e);
    return "unavailable";
  }
}

export async function releaseCheckoutLock(userId: string, token: string): Promise<void> {
  const supabase = getServiceSupabase();
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc("release_checkout_lock", {
      p_user_id: userId,
      p_token: token,
    });
    if (error) Sentry.captureException(error);
  } catch (e) {
    Sentry.captureException(e);
  }
}
