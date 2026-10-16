"use client";
import { LOCALES, useI18n } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
import { SettingsHeading } from "@/components/settings/SettingsShell";

export default function GeneralSettings() {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  return <>
    <SettingsHeading section="general" />
    <div className="settings-card space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="max-w-sm"><label htmlFor="settings-language" className="font-medium">{t("settings.language")}</label><p id="language-help" className="mt-2 text-sm leading-6 text-slate-500">{t("settings.languageHelp")}</p></div>
        <select id="settings-language" aria-describedby="language-help" value={locale} onChange={e => setLocale(e.target.value as typeof locale)} className="rounded-lg border border-line bg-background px-4 py-2.5 text-sm sm:min-w-36">{LOCALES.map(l => <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>)}</select>
      </div>
      <fieldset className="border-t border-line pt-7">
        <legend className="float-left w-full font-medium">{t("settings.theme")}</legend>
        <p className="clear-both pt-2 text-sm leading-6 text-slate-500">{t("settings.themeHelp")}</p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {(["system", "light", "dark"] as Theme[]).map(value => <label key={value} className={`cursor-pointer rounded-xl border p-2.5 sm:p-3 ${theme === value ? "border-navy bg-background" : "border-line"}`}>
            <span aria-hidden="true" className={`theme-preview theme-preview-${value}`}><span /><span /></span>
            <span className="mt-3 flex items-center justify-center gap-2 text-xs sm:text-sm"><input className="accent-navy" type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />{t(`settings.${value}`)}</span>
          </label>)}
        </div>
      </fieldset>
    </div>
    <p className="mt-4 text-xs text-slate-500">{t("settings.autoSave")}</p>
  </>;
}
