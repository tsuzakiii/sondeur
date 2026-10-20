"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useInterests } from "@/lib/useInterests";
import { INTERESTS, MAX_INTERESTS, normalizeInterests, type InterestId } from "@/lib/interests";

export default function InterestSettings() {
  const preferences = useInterests();
  return <InterestChoices key={`${preferences.owner}:${preferences.interests.join(",")}`} {...preferences} />;
}

function InterestChoices({ interests, ready, owner, save }: ReturnType<typeof useInterests>) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<InterestId[]>(interests);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const changed = normalizeInterests(selected).join(",") !== interests.join(",");
  return <fieldset className="border-t border-line pt-7" disabled={!ready || status === "saving"}>
    <legend className="float-left w-full font-medium">{t("settings.interests")}</legend>
    <p className="clear-both pt-2 text-sm leading-6 text-slate-500">{t("settings.interestsHelp")}</p>
    <div className="mt-4 flex flex-wrap gap-2">
      {INTERESTS.map(topic => {
        const checked = selected.includes(topic.id);
        return <button key={topic.id} type="button" aria-pressed={checked}
          disabled={!checked && selected.length >= MAX_INTERESTS}
          className={`rounded-xl px-4 py-2 text-sm transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${checked ? "neu-inset text-navy" : "neu-raised-sm text-slate-500 hover:text-navy"}`}
          onClick={() => { setStatus("idle"); setSelected(checked ? selected.filter(id => id !== topic.id) : [...selected, topic.id]); }}>
          {topic[locale]}
        </button>;
      })}
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">{t(owner === "guest" ? "settings.interestsGuest" : "settings.interestsAccount")}</p>
      <button type="button" disabled={!changed || status === "saving"}
        className="rounded-xl bg-navy px-4 py-2 text-sm text-white disabled:opacity-40"
        onClick={async () => {
          setStatus("saving");
          const ok = await save(selected);
          setStatus(ok ? "idle" : "error");
        }}>{t(status === "saving" ? "settings.saving" : "settings.saveInterests")}</button>
    </div>
    {status === "error" && <p role="alert" className="mt-3 text-sm text-wine">{t("settings.interestsFailed")}</p>}
  </fieldset>;
}
