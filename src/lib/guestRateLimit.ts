/**
 * 未認証リクエストへのレート制限 (IPハッシュベース、Supabase永続化)。
 * サーバーレスインスタンスのライフサイクルに依存しない。
 */

import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";

const DAILY_LIMIT = 15;

let _serviceClient: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (_serviceClient) return _serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  _serviceClient = createClient(url, key);
  return _serviceClient;
}

async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkGuestRateLimit(ip: string): Promise<boolean> {
  const supabase = getServiceClient();
  if (!supabase) return true;

  const ipHash = await hashIp(ip);
  const { data: allowed, error } = await (supabase.rpc as Function)("consume_guest_quota", {
    p_ip_hash: ipHash,
    p_limit: DAILY_LIMIT,
  });
  if (error) {
    console.error("[guest-rate-limit] RPC failed, allowing request", error);
    Sentry.captureException(error); // fail-openなので実際の失敗頻度を監視する
    return true;
  }
  return !!allowed;
}

export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
