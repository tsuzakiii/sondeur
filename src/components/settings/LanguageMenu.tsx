"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { LOCALES, useI18n } from "@/lib/i18n";

export default function LanguageMenu() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    options.current[active]?.focus();
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function close() { setOpen(false); trigger.current?.focus(); }
  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && open) { event.preventDefault(); close(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) { setActive(LOCALES.findIndex(l => l.code === locale)); setOpen(true); return; }
      setActive(index => event.key === "Home" ? 0 : event.key === "End" ? LOCALES.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + LOCALES.length) % LOCALES.length);
    }
  }
  return <div ref={root} className="relative w-full sm:w-44" onKeyDown={keyDown} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" id="settings-language" aria-label={`${t("settings.language")}: ${LOCALES.find(l => l.code === locale)?.label}`} aria-describedby="language-help" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => { setActive(LOCALES.findIndex(l => l.code === locale)); setOpen(!open); }} className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm ${open ? "neu-inset" : "neu-raised-sm"}`}>
      <span>{LOCALES.find(l => l.code === locale)?.label}</span>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={open ? "m4 10 4-4 4 4" : "m4 6 4 4 4-4"} /></svg>
    </button>
    {open && <div id={id} role="menu" aria-label={t("settings.language")} className="language-menu absolute right-0 z-20 mt-3 w-full rounded-xl p-1.5">
      {LOCALES.map((language, index) => <button key={language.code} ref={element => { options.current[index] = element; }} role="menuitemradio" aria-checked={locale === language.code} tabIndex={active === index ? 0 : -1} lang={language.code} onFocus={() => setActive(index)} onClick={() => { setLocale(language.code); close(); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${locale === language.code ? "neu-inset text-navy" : "text-slate-600 hover:neu-flat"}`}>
        {language.label}<span aria-hidden="true" className="ml-5 text-xs">{locale === language.code ? "✓" : ""}</span>
      </button>)}
    </div>}
  </div>;
}
