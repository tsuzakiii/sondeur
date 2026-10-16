"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthInfo, useAuthReady, signInWithEmail } from "@/lib/authState";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
export default function LoginPage() {
  const { t } = useI18n();
  const auth = useAuthInfo();
  const ready = useAuthReady();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (ready && auth.kind === "signedIn") router.replace("/"); }, [ready, auth, router]);
  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const failure = await signInWithEmail(email.trim());
      if (failure) setError(t("auth.sendFailed", { error: failure }));
      else setSent(true);
    } catch { setError(t("settings.loginUnavailable")); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
    <Link href="/" className="mb-10 flex items-center gap-2 font-semibold tracking-wide"><span className="h-2 w-2 rounded-full bg-navy" />Sondeur</Link>
    <h1 className="text-2xl font-semibold">{t("auth.signIn")}</h1>
    <p className="mt-4 text-sm leading-7 text-slate-500">{t("settings.guestHelp")}</p>
    {!isSupabaseConfigured() ? <p className="mt-6 text-sm">{t("settings.loginUnavailable")}</p> : sent ? <div role="status" className="mt-8"><p>{t("auth.linkSent")}</p><p className="mt-2 text-sm text-slate-500">{t("auth.linkSentHint")}</p><button className="settings-button mt-4" onClick={() => setSent(false)}>{t("settings.retry")}</button></div> : <form className="mt-8" onSubmit={sendLink}>
      <label htmlFor="login-email" className="text-sm">{t("settings.email")}</label>
      <input required autoComplete="email" id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="neu-inset mt-3 block w-full rounded-xl px-4 py-3 text-sm" />
      <button disabled={busy || !ready || auth.kind === "signedIn"} className="mt-5 w-full rounded-xl bg-navy px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{t(busy ? "settings.sending" : "auth.signIn")}</button>
    </form>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <Link href="/" className="mt-9 text-sm text-slate-500">← {t("settings.back")}</Link>
  </main>;
}
