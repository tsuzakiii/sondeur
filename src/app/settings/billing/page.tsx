"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuthInfo } from "@/lib/authState";
import { useI18n } from "@/lib/i18n";
import { useTreeStore } from "@/lib/store";
import { GUEST_NODE_LIMIT, PLAN_NODE_LIMITS } from "@/lib/planLimits";
import { useBillingProfile } from "@/lib/useBillingProfile";
import { pickPlanMode } from "@/components/authFooterMode";
import { SettingsHeading } from "@/components/settings/SettingsShell";
import { readBillingReturnStatus, rememberBillingReturnStatus, type BillingReturnStatus } from "@/lib/billingReturn";

export default function BillingSettings() {
  const auth = useAuthInfo();
  return <BillingContent key={auth.kind === "signedIn" ? auth.userId : "guest"} />;
}
function BillingContent() {
  const auth = useAuthInfo();
  const { t } = useI18n();
  const { profile, ready, failed, slowNote, retry } = useBillingProfile();
  const { trees } = useTreeStore();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<BillingReturnStatus | null>(null);
  useEffect(() => {
    active.current = true;
    const status = readBillingReturnStatus();
    const timer = window.setTimeout(() => setNotice(status), 0);
    if (status) {
      rememberBillingReturnStatus(status);
      const url = new URL(window.location.href);
      url.searchParams.delete("billing");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    return () => { active.current = false; window.clearTimeout(timer); };
  }, []);
  async function openBilling(path: "checkout" | "portal", plan?: "standard" | "pro") {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError("");
    try {
      const res = await fetch(`/api/billing/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(plan ? { plan } : {}) });
      const data = await res.json();
      if (!active.current) return;
      if (!res.ok || !data?.url) throw new Error(data?.error === "billing not configured" ? "auth.billingNotReady" : "settings.billingFailed");
      window.location.assign(data.url);
    } catch (err) {
      if (active.current) setError(err instanceof Error && err.message === "auth.billingNotReady" ? err.message : "settings.billingFailed");
    } finally { inFlight.current = false; if (active.current) setPending(false); }
  }
  const guestUsed = Object.values(trees).reduce((sum, tr) => sum + Object.keys(tr.nodes).length + (tr.documentGenerations ?? 0), 0);
  const mode = profile && ready ? pickPlanMode(profile.plan, profile.hasStripe) : null;
  const limit = profile ? PLAN_NODE_LIMITS[profile.plan] : null;
  return <>
    <SettingsHeading section="billing" />
    {notice && <div role="status" className="mb-5 rounded-xl border border-line p-4 text-sm"><p className="font-medium">{t(`billing.${notice}Title`)}</p><p className="mt-1 text-slate-500">{t(`billing.${notice}Body`)}</p></div>}
    {auth.kind === "signedOut" ? <div className="settings-card"><p className="font-medium">{t("settings.guestBilling")}</p><p className="mt-3 text-sm text-slate-500">{t("settings.trial", { used: Math.min(guestUsed, GUEST_NODE_LIMIT), limit: GUEST_NODE_LIMIT })}</p><Link href="/settings/account" className="settings-button mt-6">{t("auth.signIn")}</Link></div> : <>
      <section className="settings-card">
        <h3 className="text-sm text-slate-500">{t("settings.currentPlan")}</h3>
        {failed ? <div role="alert" className="mt-4"><p className="text-sm">{t("settings.loadFailed")}</p><button className="settings-button mt-3" onClick={retry}>{t("settings.retry")}</button></div> : !profile ? <p role="status" className="mt-4">{t("settings.loading")}</p> : <>
          <p className="mt-2 text-3xl font-semibold capitalize">{profile.plan}</p>
          <div className="mt-6 flex items-center justify-between gap-4 text-sm"><span>{t("settings.usage")}</span><span>{profile.used} / {limit ?? "∞"}</span></div>
          {typeof limit === "number" && <progress className="mt-3 h-2 w-full accent-navy" max={limit} value={Math.min(profile.used, limit)} aria-label={t("settings.usage")} />}
          <p className="mt-3 text-xs leading-6 text-slate-500">{t("settings.usageHelp")}</p>
        </>}
        {slowNote && <p role="status" className="mt-4 text-sm text-slate-500">{t("billing.slowNote")}</p>}
      </section>
      {!failed && mode === "upgrade" && <section className="mt-5">
        <div className="grid gap-4 sm:grid-cols-2">{([{ id: "standard", name: "Standard", price: 7, count: 100 }, { id: "pro", name: "Pro", price: 14, count: 300 }] as const).map(plan => <div key={plan.id} className="settings-card"><h3 className="font-semibold">{plan.name}</h3><p className="mt-4"><span className="text-3xl font-semibold">${plan.price}</span><span className="ml-2 text-sm text-slate-500">USD {t("settings.perMonth")}</span></p><p className="mt-2 text-sm text-slate-500">{t("settings.allowance", { count: plan.count })}</p><button disabled={pending} onClick={() => void openBilling("checkout", plan.id)} className="settings-button mt-6 w-full">{t(pending ? "settings.opening" : "settings.choose", { plan: plan.name })}</button></div>)}</div>
        <p className="mt-4 text-xs leading-6 text-slate-500">{t("auth.consentPre")}<Link href="/legal/terms" className="underline">{t("legal.terms")}</Link>{t("auth.consentMid")}<Link href="/legal/tokushoho" className="underline">{t("legal.tokushoho")}</Link>{t("auth.consentPost")}</p>
      </section>}
      {!failed && (mode === "manage" || mode === "recover") && <section className="settings-card mt-5"><h3 className="font-medium">{t("settings.manage")}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{t(mode === "recover" ? "settings.recoverHelp" : "settings.portalHelp")}</p><div className="mt-5 flex flex-wrap gap-3"><button disabled={pending} onClick={() => void openBilling("portal")} className="settings-button">{t(pending ? "settings.opening" : "settings.payment")}</button><button disabled={pending} onClick={() => void openBilling("portal")} className="settings-button">{t(pending ? "settings.opening" : "settings.manage")}</button></div>{mode === "manage" && <button disabled={pending} onClick={() => void openBilling("portal")} className="mt-6 text-sm text-wine underline underline-offset-4">{t("settings.cancel")} ↗</button>}</section>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{t(error)}</p>}
    </>}
  </>;
}
