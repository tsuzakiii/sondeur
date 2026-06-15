"use client";

import { useEffect, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { signInWithEmail, signOut, useAuthInfo } from "@/lib/authState";
import { PLAN_NODE_LIMITS } from "@/lib/planLimits";

const PLAN_LABEL: Record<string, string> = { free: "Free", standard: "Standard", pro: "Pro" };

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function goBilling(path: "checkout" | "portal", plan?: "standard" | "pro") {
  const res = await fetch(`/api/billing/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan ? { plan } : {}),
  });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (res.ok && data?.url) {
    window.location.href = data.url;
  } else {
    alert(data?.error === "billing not configured" ? "課金は現在準備中です。" : `エラー: ${data?.error ?? res.status}`);
  }
}

export default function AuthFooter() {
  const auth = useAuthInfo();
  const [email, setEmail] = useState("");
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState(false);
  const [profile, setProfile] = useState<{ plan: string; used: number } | null>(null);
  const [showPlans, setShowPlans] = useState(false);

  // プランと今月の使用量を表示する (ログイン時 + 課金から戻った時に再取得)
  useEffect(() => {
    if (auth.kind !== "signedIn") {
      setProfile(null);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase
      .from("profiles")
      .select("plan, monthly_node_count, month_key")
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile({
            plan: data.plan,
            used: data.month_key === currentMonthKey() ? data.monthly_node_count : 0,
          });
        }
      });
  }, [auth]);

  if (!isSupabaseConfigured()) return null;

  if (auth.kind === "signedIn") {
    const plan = profile?.plan ?? "free";
    const limit = plan in PLAN_NODE_LIMITS ? PLAN_NODE_LIMITS[plan] : PLAN_NODE_LIMITS.free;
    return (
      <div className="border-t border-[#d8dde8] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] text-slate-400" title={auth.email}>
            {auth.email}
          </span>
          <button
            onClick={signOut}
            className="shrink-0 text-[11px] text-slate-400 transition-colors hover:text-wine"
          >
            ログアウト
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500">
            <span className="font-semibold text-navy">{PLAN_LABEL[plan] ?? plan}</span>
            {profile && limit !== null && (
              <span className="ml-1.5 text-slate-400">
                今月 {profile.used}/{limit}
              </span>
            )}
            {profile && limit === null && <span className="ml-1.5 text-slate-400">無制限</span>}
          </span>
          {plan === "free" ? (
            <button
              onClick={() => setShowPlans((v) => !v)}
              className="shrink-0 text-[11px] font-medium text-navy transition-opacity hover:opacity-70"
            >
              アップグレード
            </button>
          ) : (
            <button
              onClick={() => void goBilling("portal")}
              className="shrink-0 text-[11px] text-slate-400 transition-colors hover:text-navy"
            >
              プラン管理
            </button>
          )}
        </div>
        {showPlans && plan === "free" && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => void goBilling("checkout", "standard")}
              className="neu-raised-sm flex-1 rounded-lg px-2 py-1.5 text-[11px] text-slate-600 transition-colors hover:text-navy"
            >
              <span className="font-semibold">Standard</span> ¥980
              <br />
              <span className="text-[10px] text-slate-400">500ノード/月</span>
            </button>
            <button
              onClick={() => void goBilling("checkout", "pro")}
              className="neu-raised-sm flex-1 rounded-lg px-2 py-1.5 text-[11px] text-slate-600 transition-colors hover:text-navy"
            >
              <span className="font-semibold">Pro</span> ¥1,980
              <br />
              <span className="text-[10px] text-slate-400">無制限</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  if (sent) {
    return (
      <div className="border-t border-[#d8dde8] px-4 py-3 text-[11px] leading-5 text-slate-400">
        ログインリンクをメールに送りました。
        <br />
        メール内のリンクを開いてください。
      </div>
    );
  }

  return (
    <div className="border-t border-[#d8dde8] px-3 py-3">
      {asking ? (
        <input
          autoFocus
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAsking(false);
            if (e.key === "Enter" && email.includes("@")) {
              void signInWithEmail(email.trim()).then((err) => {
                if (err) alert(`送信に失敗しました: ${err}`);
                else setSent(true);
              });
            }
          }}
          placeholder="メールアドレス"
          className="neu-inset w-full rounded-lg px-2.5 py-1 text-[12px] text-slate-700 placeholder-slate-400 outline-none"
        />
      ) : (
        <button
          onClick={() => setAsking(true)}
          className="w-full rounded-lg py-1 text-[12px] text-slate-400 transition-colors hover:text-navy"
        >
          ログインして航跡をクラウドに保存
        </button>
      )}
    </div>
  );
}
