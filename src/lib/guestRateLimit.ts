/**
 * 未認証リクエストへの簡易レート制限 (IPベース、インスタンス内メモリ)。
 * クライアント側のゲストゲート (10ノード) を直叩きで回避された場合の保険。
 * サーバーレスではインスタンス毎にリセットされるため完全ではないが、
 * 「公開URLに対する無料生成の蛇口」を絞る目的には十分。
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PER_WINDOW = 15; // ゲスト枠10 + 余裕

const hits = new Map<string, { count: number; windowStart: number }>();

export function checkGuestRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  // 肥大化防止
  if (hits.size > 10000) {
    for (const [k, v] of hits) {
      if (now - v.windowStart > WINDOW_MS) hits.delete(k);
    }
  }
  return entry.count <= MAX_PER_WINDOW;
}

export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
