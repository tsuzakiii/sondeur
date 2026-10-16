"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuthInfo } from "@/lib/authState";
import { getSupabase } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { SettingsHeading } from "@/components/settings/SettingsShell";

export default function AccountSettings() {
  const auth = useAuthInfo();
  return <AccountContent key={auth.kind === "signedIn" ? auth.userId : "guest"} />;
}
function AccountContent() {
  const auth = useAuthInfo();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (!window.confirm(t("auth.signOutConfirm"))) return;
    setBusy(true); setError("");
    try {
      const result = await getSupabase()?.auth.signOut();
      if (!result || result.error) setError(t("settings.logoutFailed"));
    } catch { setError(t("settings.logoutFailed")); }
    finally { setBusy(false); }
  }
  return <>
    <SettingsHeading section="account" />
    <section className="settings-card">
      {auth.kind === "signedIn" ? <>
        <h3 className="text-sm text-slate-500">{t("settings.email")}</h3><p className="mt-2 break-all font-medium">{auth.email}</p><p className="mt-3 text-sm text-slate-500">{t("settings.savedHelp")}</p>
        <div className="mt-7 border-t border-line pt-6"><p className="text-sm text-slate-500">{t("settings.logoutHelp")}</p><button disabled={busy} onClick={() => void logout()} className="settings-button mt-4">{t("auth.signOut")}</button></div>
      </> : null}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </section>
    {auth.kind === "signedIn" && <section className="settings-card mt-5"><h3 className="font-medium">{t("settings.deleteTitle")}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{t("settings.deleteHelp")}</p><a className="mt-4 inline-block text-sm text-wine underline underline-offset-4" href="mailto:sondeur.app@gmail.com?subject=Sondeur%20account%20deletion">{t("settings.deleteRequest")}</a></section>}
    <section className="mt-8"><h3 className="text-xs text-slate-500">{t("settings.support")}</h3><div className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-xs text-slate-500">{([['/about','about'],['/legal/terms','terms'],['/legal/privacy','privacy'],['/legal/tokushoho','tokushoho']] as const).map(([href,key]) => <Link key={key} className="hover:text-navy" href={href}>{t(`legal.${key}`)}</Link>)}</div></section>
  </>;
}
