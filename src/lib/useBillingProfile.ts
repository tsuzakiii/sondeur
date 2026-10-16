"use client";
import { useEffect, useState } from "react";
import { useAuthInfo } from "@/lib/authState";
import { getSupabase } from "@/lib/supabase/client";
import { clearBillingReturnStatus, readBillingReturnStatus } from "@/lib/billingReturn";
import { createCancellableSleep } from "@/lib/cancellableSleep";
import { shouldShowSlowNote } from "@/lib/pollingSlowNote";
import { loadCachedProfile, resolveDisplayProfile, saveCachedProfile, type CachedProfile } from "@/components/authFooterCache";
function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function useBillingProfile() {
  const auth = useAuthInfo();
  const [profile, setProfile] = useState<CachedProfile | null>(null);
  const [slowNote, setSlowNote] = useState(false);
  const [revision, setRevision] = useState(0);
  const [readyOwner, setReadyOwner] = useState<string | null>(null);
  const [failedOwner, setFailedOwner] = useState<string | null>(null);
  useEffect(() => {
    // localStorage 名前空間の掃除は authState.ts (認証遷移を扱う唯一の場所) が担当する。
    // 設定画面を離れている間も認証層がキャッシュの破棄を担当する。
    // ここに signout 検出を置くと mount していない間の signout を取り逃がす。
    // in-memory の profile state は setProfile(null) で reset せず、render 時の
    // resolveDisplayProfile が auth.userId mismatch を検出して null 化するのに任せる。
    if (auth.kind !== "signedIn") return;
    const supabase = getSupabase();
    if (!supabase) return;
    const mk = currentMonthKey();
    const uid = auth.userId;

    let cancelled = false;

    // この userId に紐付いた cache だけを読む。前ユーザーの cache は別 key に格納されて
    // いるため、ここでは絶対に読めない。lint (react-hooks/set-state-in-effect) が effect
    // 内の同期 setState を拒否するので setTimeout(0) 経由で 1 macrotask 遅らせる。
    // render-time の resolveDisplayProfile が userId mismatch を弾く第二防壁なので
    // この遅延で cross-user leak が広がることはない。
    const cached = loadCachedProfile(uid);
    const cacheTimer = cached
      ? window.setTimeout(() => {
          if (cancelled) return;
          setProfile({ ...cached, userId: uid, used: cached.monthKey === mk ? cached.used : 0 });
        }, 0)
      : undefined;

    const billingReturn = readBillingReturnStatus();
    // 30 attempts × 1500ms ≈ 45s。以前は 10 attempts (15s) だったが webhook 遅延で
    // 反映が間に合わないケースがあった (#7 / M4)。10 attempt を過ぎても Free のままなら
    // 補助テキスト (slowNote) を表示してユーザーに再読み込みを促す。
    const maxAttempts = billingReturn === "success" ? 30 : 1;
    let currentSleep: { cancel: () => void } | null = null;

    const loadProfile = async (): Promise<CachedProfile | null> => {
      const { data } = await supabase
        .from("profiles")
        .select("plan, monthly_node_count, month_key, stripe_customer_id")
        .single();
      if (cancelled) return null;
      if (data) {
        if (cacheTimer !== undefined) window.clearTimeout(cacheTimer);
        setReadyOwner(uid);
        setFailedOwner(null);
        const p: CachedProfile = {
          userId: uid,
          plan: data.plan,
          used: data.month_key === mk ? data.monthly_node_count : 0,
          hasStripe: !!data.stripe_customer_id,
          monthKey: mk,
        };
        setProfile(p);
        saveCachedProfile(uid, p);
        return p;
      }
      setFailedOwner(uid);
      return null;
    };

    void (async () => {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        // loop 頭で cancelled を確認する。sleep から復帰した直後の attempt では、
        // effect cleanup で cancel() が呼ばれても for header に到達するまで cancelled
        // フラグが読まれない。ここで確実に打ち切る。
        if (cancelled) return;
        const p = await loadProfile();
        if (cancelled) return;
        if (billingReturn !== "success" || (p && p.plan !== "free")) {
          setSlowNote(false);
          clearBillingReturnStatus();
          return;
        }
        // p が null (fetch 失敗) の時は null を渡す。shouldShowSlowNote は plan === "free"
        // だけを true とするので null は false になり、fetch 失敗中に slow note が誤って
        // 出ることはない。
        setSlowNote(shouldShowSlowNote(attempt, p?.plan ?? null));
        if (attempt < maxAttempts - 1) {
          // effect cleanup で cancel できる sleep。fake sleep で await の残置なく
          // ループを閉じる (#8 / L1)。
          const sleep = createCancellableSleep(1500);
          currentSleep = sleep;
          await sleep.promise;
          currentSleep = null;
        }
      }
      clearBillingReturnStatus();
    })().catch(() => { if (!cancelled) setFailedOwner(uid); });

    return () => {
      cancelled = true;
      if (cacheTimer !== undefined) window.clearTimeout(cacheTimer);
      currentSleep?.cancel();
    };
  }, [auth, revision]);

  return {
    profile: auth.kind === "signedIn" ? resolveDisplayProfile(profile, auth.userId) : null,
    ready: auth.kind === "signedIn" && readyOwner === auth.userId,
    failed: auth.kind === "signedIn" && failedOwner === auth.userId,
    slowNote,
    retry: () => { setReadyOwner(null); setFailedOwner(null); setRevision(n => n + 1); },
  };
}
