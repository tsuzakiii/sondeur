"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "./supabase/client";
import { useAuthInfo } from "./authState";

export type Locale = "en" | "ja";

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
];

type Dict = Record<string, string>;

const en: Dict = {
  "home.tagline": "Sound the depths of understanding.",
  "home.placeholder": "What do you want to understand?",
  "home.placeholderActive": "Ask a new question…",
  "home.submit": "Explore",
  "home.guestBlocked": "You've used all {limit} trial nodes.",
  "home.guestBlockedCta": "Sign in (free) to continue exploring. Your trails are preserved.",
  "home.guestBlockedHint": "Sign in from the bottom-left of the sidebar (email only)",
  "home.close": "Close",
  "home.hint": "{what} and {why}, as deep as you like.",

  "sidebar.open": "Open sidebar",
  "sidebar.close": "Close sidebar",
  "sidebar.home": "Go home",
  "sidebar.new": "New question",
  "sidebar.search": "Search trails…",
  "sidebar.noResults": "No results for “{query}”.",
  "sidebar.empty": "No trails yet.",
  "sidebar.emptyHint": "Drop your first question.",
  "sidebar.justNow": "just now",
  "sidebar.minutesAgo": "{n}m ago",
  "sidebar.hoursAgo": "{n}h ago",
  "sidebar.daysAgo": "{n}d ago",
  "sidebar.node": "{count} node",
  "sidebar.nodes": "{count} nodes",
  "sidebar.deleteConfirm": "Delete “{title}”?",
  "sidebar.delete": "Delete",
  "sidebar.share": "Share",
  "sidebar.unshare": "Stop sharing",
  "sidebar.linkCopied": "Link copied",
  "sidebar.unshared": "Sharing stopped",

  "auth.signOut": "Sign out",
  "auth.signOutConfirm": "Sign out?",
  "auth.cancel": "Cancel",
  "auth.thisMonth": "This month {used}/{limit}",
  "auth.unlimited": "Unlimited",
  "auth.upgrade": "Upgrade",
  "auth.managePlan": "Manage plan",
  "auth.standardNodes": "500 nodes/mo",
  "auth.proNodes": "Unlimited",
  "auth.linkSent": "Login link sent to your email.",
  "auth.linkSentHint": "Open the link in the email.",
  "auth.signIn": "Log in / Sign up",
  "auth.email": "Email address",
  "auth.sendFailed": "Failed to send: {error}",
  "auth.billingNotReady": "Billing is being prepared.",
  "auth.error": "Error: {error}",
  "auth.notConfigured": "Supabase not configured",

  "graph.whatDesc": "what is it",
  "graph.whyDesc": "why is it so",
  "graph.askDesc": "in your own words",

  "panel.edgeRoot": "Question",
  "panel.edgeWhat": "What is it",
  "panel.edgeWhy": "Why is it",
  "panel.edgeAsk": "Ask",
  "panel.about": "about “{span}”",
  "panel.close": "Close",
  "panel.highlightWhat": "Explored with What — click to jump",
  "panel.highlightWhy": "Explored with Why — click to jump",
  "panel.highlightAsk": "Already asked — click to jump",
  "panel.generationFailed": "Generation failed.",
  "panel.questionPlaceholder": "Ask about this explanation…",
  "panel.questionSubmit": "Ask",
  "panel.pillAskPlaceholder": "Ask about “{span}”…",
  "panel.copy": "Copy",
  "panel.copied": "Copied",
  "panel.regenerate": "Regenerate",

  "expand.planLimit": "Plan limit reached.",
  "expand.generationFailed": "Generation failed",
  "expand.guestExhausted": "Trial exhausted. Sign in (free) to continue.",

  "legal.about": "About",
  "legal.terms": "Terms of Service",
  "legal.privacy": "Privacy Policy",
  "legal.tokushoho": "Commercial Disclosure",
  "legal.backHome": "Back to Sondeur",

  "auth.consentPre": "By purchasing you agree to the ",
  "auth.consentMid": " and the ",
  "auth.consentPost": ".",

  "notFound.title": "Page not found",
  "notFound.body": "This page doesn't exist or is no longer available.",
  "notFound.cta": "Back to home",
  "error.title": "Something went wrong",
  "error.body": "An unexpected error occurred. Please try again.",
  "error.retry": "Try again",

  "lang.current": "EN",
  "lang.title": "Language",
};

const ja: Dict = {
  "home.tagline": "わからないことを、わかるまで測深する。",
  "home.placeholder": "何を理解したいですか？",
  "home.placeholderActive": "新しい問いを立てる...",
  "home.submit": "測深",
  "home.guestBlocked": "お試し枠（{limit}ノード）を使い切りました。",
  "home.guestBlockedCta": "ログイン（無料）すると続きから探索できます。データはそのまま引き継がれます。",
  "home.guestBlockedHint": "サイドバー左下からログイン（メールアドレスのみ）",
  "home.close": "閉じる",
  "home.hint": "{what} と {why}、好きなだけ深く。",

  "sidebar.open": "サイドバーを開く",
  "sidebar.close": "サイドバーを閉じる",
  "sidebar.home": "ホームに戻る",
  "sidebar.new": "新しい問い",
  "sidebar.search": "検索...",
  "sidebar.noResults": "「{query}」は見つかりませんでした。",
  "sidebar.empty": "まだ航跡がありません。",
  "sidebar.emptyHint": "最初の問いを入力してください。",
  "sidebar.justNow": "たった今",
  "sidebar.minutesAgo": "{n}分前",
  "sidebar.hoursAgo": "{n}時間前",
  "sidebar.daysAgo": "{n}日前",
  "sidebar.node": "{count} ノード",
  "sidebar.nodes": "{count} ノード",
  "sidebar.deleteConfirm": "「{title}」を削除しますか？",
  "sidebar.delete": "削除",
  "sidebar.share": "共有",
  "sidebar.unshare": "共有を停止",
  "sidebar.linkCopied": "リンクをコピーしました",
  "sidebar.unshared": "共有を停止しました",

  "auth.signOut": "ログアウト",
  "auth.signOutConfirm": "ログアウトしますか？",
  "auth.cancel": "キャンセル",
  "auth.thisMonth": "今月 {used}/{limit}",
  "auth.unlimited": "無制限",
  "auth.upgrade": "アップグレード",
  "auth.managePlan": "プラン管理",
  "auth.standardNodes": "500ノード/月",
  "auth.proNodes": "無制限",
  "auth.linkSent": "ログインリンクをメールに送りました。",
  "auth.linkSentHint": "メール内のリンクを開いてください。",
  "auth.signIn": "Log in / Sign up",
  "auth.email": "メールアドレス",
  "auth.sendFailed": "送信に失敗しました: {error}",
  "auth.billingNotReady": "課金は現在準備中です。",
  "auth.error": "エラー: {error}",
  "auth.notConfigured": "Supabase が設定されていません",

  "graph.whatDesc": "それは何か",
  "graph.whyDesc": "なぜそうなのか",
  "graph.askDesc": "自分の言葉で",

  "panel.edgeRoot": "問い",
  "panel.edgeWhat": "それは何か",
  "panel.edgeWhy": "なぜそうなのか",
  "panel.edgeAsk": "質問",
  "panel.about": "「{span}」について",
  "panel.close": "閉じる",
  "panel.highlightWhat": "What で探索済み — クリックで移動",
  "panel.highlightWhy": "Why で探索済み — クリックで移動",
  "panel.highlightAsk": "Ask 済み — クリックで移動",
  "panel.generationFailed": "生成に失敗しました。",
  "panel.questionPlaceholder": "この説明について質問...",
  "panel.questionSubmit": "質問",
  "panel.pillAskPlaceholder": "「{span}」について質問...",
  "panel.copy": "コピー",
  "panel.copied": "コピー済み",
  "panel.regenerate": "再生成",

  "expand.planLimit": "プランの上限に達しました。",
  "expand.generationFailed": "生成に失敗しました",
  "expand.guestExhausted": "お試し枠を使い切りました。ログイン（無料）すると続けられます。",

  "legal.about": "Sondeur について",
  "legal.terms": "利用規約",
  "legal.privacy": "プライバシーポリシー",
  "legal.tokushoho": "特定商取引法に基づく表記",
  "legal.backHome": "Sondeur に戻る",

  "auth.consentPre": "購入手続きに進むと",
  "auth.consentMid": "・",
  "auth.consentPost": "に同意したものとみなします。",

  "notFound.title": "ページが見つかりません",
  "notFound.body": "このページは存在しないか、公開が終了しています。",
  "notFound.cta": "ホームに戻る",
  "error.title": "エラーが発生しました",
  "error.body": "予期しないエラーが発生しました。もう一度お試しください。",
  "error.retry": "再試行",

  "lang.current": "JA",
  "lang.title": "言語",
};

/** テスト (キー網羅性チェック) 用に公開 */
export const dicts: Record<Locale, Dict> = { en, ja };

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>(null!);

const STORAGE_KEY = "sondeur.locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleRaw] = useState<Locale>("en");
  const auth = useAuthInfo();

  // Read stored locale on mount (avoids SSR hydration mismatch)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === "en" || stored === "ja") {
      setLocaleRaw(stored);
      document.documentElement.lang = stored;
    }
  }, []);

  useEffect(() => {
    if (auth.kind !== "signedIn") return;
    const supabase = getSupabase();
    if (!supabase) return;
    supabase
      .from("profiles")
      .select("locale")
      .single()
      .then(({ data }) => {
        if (data?.locale && (data.locale === "en" || data.locale === "ja")) {
          setLocaleRaw(data.locale);
          localStorage.setItem(STORAGE_KEY, data.locale);
          document.documentElement.lang = data.locale;
        }
      });
  }, [auth]);

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleRaw(l);
      localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.lang = l;
      const supabase = getSupabase();
      if (supabase && auth.kind === "signedIn") {
        void supabase.rpc("update_locale", { p_locale: l });
      }
    },
    [auth]
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = (dicts[locale] ?? dicts.en)[key] ?? dicts.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [locale]
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function useLocale(): [Locale, (l: Locale) => void] {
  const { locale, setLocale } = useContext(I18nContext);
  return [locale, setLocale];
}

export function getCurrentLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "en" || v === "ja" ? v : "en";
}
