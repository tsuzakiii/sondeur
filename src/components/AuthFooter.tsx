"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { signInWithEmail, signOut, useAuthInfo } from "@/lib/authState";
import { PLAN_NODE_LIMITS } from "@/lib/planLimits";
import { useI18n, useLocale, LOCALES } from "@/lib/i18n";
import { clearBillingReturnStatus, readBillingReturnStatus } from "@/lib/billingReturn";
import {
  loadCachedProfile,
  resolveDisplayProfile,
  saveCachedProfile,
  type CachedProfile,
} from "./authFooterCache";

const PLAN_LABEL: Record<string, string> = { free: "Free", standard: "Standard", pro: "Pro" };

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function LegalLinks({ t }: { t: (key: string) => string }) {
  return (
    <>
      <div className="mx-3 border-t border-[#d8dde8]" />
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-4 pb-0.5 pt-2 text-[10px] text-slate-400">
        <Link href="/about" className="transition-colors hover:text-slate-600">{t("legal.about")}</Link>
        <Link href="/legal/terms" className="transition-colors hover:text-slate-600">{t("legal.terms")}</Link>
        <Link href="/legal/privacy" className="transition-colors hover:text-slate-600">{t("legal.privacy")}</Link>
        <Link href="/legal/tokushoho" className="transition-colors hover:text-slate-600">{t("legal.tokushoho")}</Link>
      </div>
    </>
  );
}

async function goBilling(
  path: "checkout" | "portal",
  t: (key: string, vars?: Record<string, string | number>) => string,
  plan?: "standard" | "pro"
) {
  const res = await fetch(`/api/billing/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan ? { plan } : {}),
  });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (res.ok && data?.url) {
    window.location.href = data.url;
  } else {
    alert(data?.error === "billing not configured"
      ? t("auth.billingNotReady")
      : t("auth.error", { error: data?.error ?? String(res.status) }));
  }
}

export default function AuthFooter() {
  const auth = useAuthInfo();
  const { t } = useI18n();
  const [locale, setLocale] = useLocale();
  const [email, setEmail] = useState("");
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState(false);
  // 初期値は必ず null。auth が確定するまでは前ユーザーのキャッシュを一切表示しない。
  // signed-in 遷移時に auth.userId で scope されたキャッシュを読み込む (useEffect 側)。
  const [profile, setProfile] = useState<CachedProfile | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // localStorage 名前空間の掃除は authState.ts (認証遷移を扱う唯一の場所) が担当する。
    // AuthFooter は UI 遅延生成される (mobile では sidebar 折り畳み中 unmount) ので、
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
    const maxAttempts = billingReturn === "success" ? 10 : 1;

    const loadProfile = async (): Promise<CachedProfile | null> => {
      const { data } = await supabase
        .from("profiles")
        .select("plan, monthly_node_count, month_key, stripe_customer_id")
        .single();
      if (cancelled) return null;
      if (data) {
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
      return null;
    };

    void (async () => {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const p = await loadProfile();
        if (cancelled) return;
        if (billingReturn !== "success" || (p && p.plan !== "free")) {
          clearBillingReturnStatus();
          return;
        }
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }
      }
      clearBillingReturnStatus();
    })();

    return () => {
      cancelled = true;
      if (cacheTimer !== undefined) window.clearTimeout(cacheTimer);
    };
  }, [auth]);

  useEffect(() => {
    if (!popupOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopupOpen(false);
        setShowPlans(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popupOpen]);

  const supabaseReady = isSupabaseConfigured();

  if (supabaseReady && auth.kind === "signedIn") {
    // 第二防壁: 遷移直後の render では state.profile が前ユーザーのまま残りうる。
    // profile.userId が現 auth.userId と一致しない場合は null 扱いにする (useEffect 内の
    // setProfile(null) は次の render まで反映されないため、ここで能動的に無効化する)。
    const displayProfile = resolveDisplayProfile(profile, auth.userId);
    const plan = displayProfile?.plan ?? "free";
    const limit = plan in PLAN_NODE_LIMITS ? PLAN_NODE_LIMITS[plan] : PLAN_NODE_LIMITS.free;
    const usageText = limit === null
      ? t("auth.unlimited")
      : displayProfile ? `${displayProfile.used}/${limit}` : "";
    return (
      <div ref={containerRef} className="relative px-3 pb-3 pt-2">
        {/* Island */}
        <button
          onClick={() => { setPopupOpen((v) => !v); if (popupOpen) setShowPlans(false); }}
          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 transition-shadow duration-150 ${
            popupOpen ? "neu-inset" : "hover:neu-raised-sm"
          }`}
        >
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-[11px] text-slate-500" title={auth.email}>
              {auth.email}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-navy">{PLAN_LABEL[plan] ?? plan}</span>
              {usageText && <span className="text-slate-400">{usageText}</span>}
            </div>
          </div>
          <span className="mr-1.5 -mt-px shrink-0 text-[22px] leading-none text-slate-400">⚙</span>
        </button>

        {/* Popup */}
        {popupOpen && (
          <div className="fade-up absolute inset-x-3 bottom-full mb-1 rounded-xl border border-[#d8dde8] bg-background py-2 shadow-lg">
            {/* Language */}
            <div className="px-3 pb-1.5 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {t("lang.title")}
            </div>
            <div className="px-1.5 pb-1.5">
              {LOCALES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLocale(l.code)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] transition-all ${
                    locale === l.code
                      ? "neu-inset font-medium text-navy"
                      : "text-slate-500 hover:neu-flat"
                  }`}
                >
                  <span>{l.flag}</span>
                  <span>{l.label}</span>
                </button>
              ))}
            </div>

            <div className="mx-3 border-t border-[#d8dde8]" />

            {/* Plan */}
            <div className="px-3 pt-2">
              {plan === "free" ? (
                <>
                  <button
                    onClick={() => setShowPlans((v) => !v)}
                    className="w-full rounded-lg py-1.5 text-left text-[12px] font-medium text-navy transition-opacity hover:opacity-70"
                  >
                    {t("auth.upgrade")}
                  </button>
                  {showPlans && (
                    <div className="mt-1 flex gap-2 pb-1">
                      <button
                        onClick={() => void goBilling("checkout", t, "standard")}
                        className="neu-raised-sm flex-1 rounded-lg px-2 py-1.5 text-[11px] text-slate-600 transition-colors hover:text-navy"
                      >
                        <span className="font-semibold">Standard</span> $7
                        <br />
                        <span className="text-[10px] text-slate-400">{t("auth.standardNodes")}</span>
                      </button>
                      <button
                        onClick={() => void goBilling("checkout", t, "pro")}
                        className="neu-raised-sm flex-1 rounded-lg px-2 py-1.5 text-[11px] text-slate-600 transition-colors hover:text-navy"
                      >
                        <span className="font-semibold">Pro</span> $14
                        <br />
                        <span className="text-[10px] text-slate-400">{t("auth.proNodes")}</span>
                      </button>
                    </div>
                  )}
                  {showPlans && (
                    <p className="pb-1 text-[9.5px] leading-snug text-slate-400">
                      {t("auth.consentPre")}
                      <Link href="/legal/terms" className="underline transition-colors hover:text-slate-600">{t("legal.terms")}</Link>
                      {t("auth.consentMid")}
                      <Link href="/legal/tokushoho" className="underline transition-colors hover:text-slate-600">{t("legal.tokushoho")}</Link>
                      {t("auth.consentPost")}
                    </p>
                  )}
                </>
              ) : (
                <button
                  onClick={() => void goBilling("portal", t)}
                  className="w-full rounded-lg py-1.5 text-left text-[12px] text-slate-600 transition-colors hover:text-navy"
                >
                  {t("auth.managePlan")}
                </button>
              )}
            </div>

            <div className="mx-3 border-t border-[#d8dde8]" />

            {/* Sign out */}
            <div className="px-3 pb-2 pt-2">
              <button
                onClick={() => { setPopupOpen(false); setConfirmLogout(true); }}
                className="w-full rounded-lg py-1.5 text-left text-[12px] text-slate-600 transition-colors hover:text-wine"
              >
                {t("auth.signOut")}
              </button>
            </div>

            <LegalLinks t={t} />
          </div>
        )}

        {/* Logout confirmation modal */}
        {confirmLogout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm" onClick={() => setConfirmLogout(false)}>
            <div className="fade-up w-72 rounded-2xl border border-[#d8dde8] bg-background px-6 py-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <p className="text-center text-sm font-medium text-slate-700">{t("auth.signOutConfirm")}</p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setConfirmLogout(false)}
                  className="neu-raised-sm flex-1 rounded-xl py-2 text-[12px] text-slate-500 transition-colors hover:text-slate-700"
                >
                  {t("auth.cancel")}
                </button>
                <button
                  onClick={() => { setConfirmLogout(false); signOut(); }}
                  className="flex-1 rounded-xl bg-wine py-2 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  {t("auth.signOut")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* --- Signed out --- */
  return (
    <div ref={containerRef} className="relative px-3 pb-3 pt-2">
      <button
        onClick={() => setPopupOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 transition-shadow duration-150 ${
          popupOpen ? "neu-inset" : "hover:neu-raised-sm"
        }`}
      >
        <span className="min-w-0 flex-1 text-left text-[12px] text-slate-400">
          {supabaseReady ? t("auth.signIn") : t("lang.title")}
        </span>
        <span className="shrink-0 text-[22px] leading-none text-slate-400">⚙</span>
      </button>

      {popupOpen && (
        <div className="fade-up absolute inset-x-3 bottom-full mb-1 rounded-xl border border-[#d8dde8] bg-background py-2 shadow-lg">
          {/* Language */}
          <div className="px-3 pb-1.5 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {t("lang.title")}
          </div>
          <div className="px-1.5 pb-1.5">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLocale(l.code)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] transition-all ${
                  locale === l.code
                    ? "neu-inset font-medium text-navy"
                    : "text-slate-500 hover:neu-flat"
                }`}
              >
                <span>{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>

          {supabaseReady && (
            <>
              <div className="mx-3 border-t border-[#d8dde8]" />
              <div className="px-3 pb-2 pt-2">
                <button
                  onClick={() => { setPopupOpen(false); setAsking(true); }}
                  className="w-full rounded-lg py-1.5 text-left text-[12px] text-navy transition-opacity hover:opacity-70"
                >
                  {t("auth.signIn")}
                </button>
              </div>
            </>
          )}

          <LegalLinks t={t} />
        </div>
      )}

      {/* Login modal */}
      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm" onClick={() => { setAsking(false); setSent(false); }}>
          <div className="fade-up w-80 rounded-2xl border border-[#d8dde8] bg-background px-6 py-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            {sent ? (
              <div className="text-center text-sm leading-6 text-slate-600">
                <p className="font-medium text-navy">{t("auth.linkSent")}</p>
                <p className="mt-2 text-[12px] text-slate-400">{t("auth.linkSentHint")}</p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-center text-sm font-medium text-slate-700">
                  {t("auth.signIn")}
                </p>
                <input
                  autoFocus
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setAsking(false); setSent(false); }
                    if (e.key === "Enter" && email.includes("@")) {
                      void signInWithEmail(email.trim()).then((err) => {
                        if (err) alert(t("auth.sendFailed", { error: err }));
                        else setSent(true);
                      });
                    }
                  }}
                  placeholder={t("auth.email")}
                  className="neu-inset w-full rounded-xl px-3 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 outline-none"
                />
                <button
                  onClick={() => {
                    if (email.includes("@")) {
                      void signInWithEmail(email.trim()).then((err) => {
                        if (err) alert(t("auth.sendFailed", { error: err }));
                        else setSent(true);
                      });
                    }
                  }}
                  disabled={!email.includes("@")}
                  className="mt-3 w-full rounded-xl bg-navy py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  {t("auth.signIn")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
