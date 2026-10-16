"use client";
import Link from "next/link";
import { useAuthInfo } from "@/lib/authState";
import { useI18n } from "@/lib/i18n";

export default function AuthFooter() {
  const auth = useAuthInfo();
  const { t } = useI18n();
  return <div className="px-3 pb-3 pt-2">
    <Link href="/settings/general" className="flex items-center gap-3 rounded-xl px-3 py-3 text-rail-text hover:bg-rail-hover" aria-label={t("settings.title")}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg>
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t("settings.title")}</span>{auth.kind === "signedIn" && <span className="block truncate text-xs text-rail-muted">{auth.email}</span>}</span>
      <span aria-hidden="true">›</span>
    </Link>
    {auth.kind === "signedOut" && <Link href="/login" className="block px-3 pb-1 pt-2 text-xs text-rail-text">{t("auth.signIn")}</Link>}
  </div>;
}
