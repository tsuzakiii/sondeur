"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { useI18n } from "@/lib/i18n";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex h-dvh w-full items-center justify-center px-6">
      <div className="neu-raised max-w-sm rounded-2xl px-8 py-8 text-center">
        <h1 className="text-base font-bold text-slate-700">{t("error.title")}</h1>
        <p className="mt-2 text-[12.5px] leading-6 text-slate-400">{t("error.body")}</p>
        <button
          onClick={reset}
          className="mt-5 rounded-xl bg-navy px-5 py-2.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
        >
          {t("error.retry")}
        </button>
      </div>
    </div>
  );
}
