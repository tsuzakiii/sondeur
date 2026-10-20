"use client";
import { useI18n } from "@/lib/i18n";
import { useTheme, type Theme } from "@/lib/theme";
import LanguageMenu from "@/components/settings/LanguageMenu";
import { SettingsHeading } from "@/components/settings/SettingsShell";
import InterestSettings from "@/components/settings/InterestSettings";

export default function GeneralSettings() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  return <>
    <SettingsHeading section="general" />
    <div className="settings-card space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="max-w-sm"><label htmlFor="settings-language" className="font-medium">{t("settings.language")}</label><p id="language-help" className="mt-2 text-sm leading-6 text-slate-500">{t("settings.languageHelp")}</p></div>
        <LanguageMenu />
      </div>
      <fieldset className="border-t border-line pt-7">
        <legend className="float-left w-full font-medium">{t("settings.theme")}</legend>
        <p className="clear-both pt-2 text-sm leading-6 text-slate-500">{t("settings.themeHelp")}</p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {(["system", "light", "dark"] as Theme[]).map(value => <label key={value} className={`cursor-pointer rounded-xl p-3 sm:p-4 ${theme === value ? "neu-inset text-navy" : "hover:neu-flat text-slate-500"}`}>
            <span aria-hidden="true" className={`theme-preview theme-preview-${value}`}><span /><span /></span>
            <span className="mt-3 flex items-center justify-center gap-2 text-xs sm:text-sm"><input className="peer sr-only" type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} /><span aria-hidden="true" className="theme-radio peer-checked:after:opacity-100 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-navy" />{t(`settings.${value}`)}</span>
          </label>)}
        </div>
      </fieldset>
      <InterestSettings />
    </div>
    <p className="mt-4 text-xs text-slate-500">{t("settings.autoSave")}</p>
  </>;
}
