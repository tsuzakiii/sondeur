// per-user checkout lock。#15 / docs/fix-checkout-atomic-lock.md 参照。
// tryAcquire: 60s TTL 内の race loser には null を返す。
// 環境未設定 (SUPABASE_SECRET_KEY なし) は "unavailable" で fail-CLOSED。

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
    if (error) {
      Sentry.captureException(error);
      return null;
    }
    if (typeof data === "string" && data.length > 0) return data;
    return null;
  } catch (e) {
    Sentry.captureException(e);
    return null;
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
