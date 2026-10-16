"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getSupabase } from "./supabase/client";
import { useAuthInfo } from "./authState";

export type Locale = "en" | "ja";

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
];

type Dict = Record<string, string>;

const en: Dict = {
  "settings.title": "Settings",
  "settings.general": "General",
  "settings.billing": "Plan & billing",
  "settings.account": "Account",
  "settings.back": "Back to exploration",
  "settings.guest": "Guest",
  "settings.generalIntro": "Make Sondeur feel at home.",
  "settings.language": "Language",
  "settings.languageHelp": "Used for menus and new explanations. Saved content stays in its original language.",
  "settings.theme": "Color theme",
  "settings.themeHelp": "Choose how Sondeur looks on this browser.",
  "settings.system": "System",
  "settings.light": "Light",
  "settings.dark": "Dark",
  "settings.autoSave": "Changes are saved automatically.",
  "settings.billingIntro": "Your plan, usage, and payment details in one place.",
  "settings.currentPlan": "Current plan",
  "settings.usage": "Generations this month",
  "settings.usageHelp": "Explanations and document creation each use one generation. Reopening saved content is free. Usage resets at the start of each UTC calendar month.",
  "settings.perMonth": "/ month",
  "settings.allowance": "{count} generations / month",
  "settings.manage": "Manage subscription",
  "settings.payment": "Payment methods & invoices",
  "settings.cancel": "Cancel subscription",
  "settings.portalHelp": "Manage your renewal date, payment details, and cancellation in Stripe. Opening it does not change your subscription.",
  "settings.recoverHelp": "A billing account already exists. Check your payment or subscription status in Stripe before starting another subscription.",
  "settings.choose": "Choose {plan}",
  "settings.loading": "Loading…",
  "settings.opening": "Opening…",
  "settings.retry": "Try again",
  "settings.loadFailed": "Could not load your plan. Try again before managing your subscription.",
  "settings.billingFailed": "Could not open billing. Please try again.",
  "settings.guestBilling": "Sign in to see your plan and manage billing.",
  "settings.trial": "Trial usage: {used} / {limit}",
  "settings.accountIntro": "Your sign-in and saved explorations.",
  "settings.email": "Email address",
  "settings.signedIn": "Signed in",
  "settings.savedHelp": "Your explorations and summary documents are saved to your account.",
  "settings.guestHelp": "Sign in with an email link to keep your explorations and documents across devices. Your guest work will carry over.",
  "settings.sending": "Sending…",
  "settings.logoutHelp": "Sign out of this browser. Your saved account data will remain.",
  "settings.logoutFailed": "Could not sign out. Please try again.",
  "settings.deleteTitle": "Delete account",
  "settings.deleteHelp": "To request account and data deletion, contact us from your registered email address. You can cancel a paid subscription under Plan & billing.",
  "settings.deleteRequest": "Request deletion by email",
  "settings.support": "Help & information",
  "settings.loginUnavailable": "Sign-in is currently unavailable. Please try again later.",

  "document.action": "Summarize",
  "document.open": "Document",
  "document.title": "Your exploration, as a document",
  "document.intro": "Turn the completed explanations into one connected document with original sources. No new research.",
  "document.generate": "Create document",
  "document.generating": "Writing…",
  "document.cost": "Uses 1 generation. Saved to your account and available on your other devices.",
  "document.guestCost": "Uses 1 generation. Sign in to save to your account, or download a copy.",
  "document.saving": "Saving to your account…",
  "document.savedCloud": "Saved to your account",
  "document.unsavedCloud": "Not yet saved to your account",
  "document.saveFailed": "Could not save to your account. Your document is still available here. Retry saving or download a copy.",
  "document.retrySave": "Retry save",
  "document.copy": "Copy",
  "document.download": "Download .md",
  "document.regenerate": "Update document",
  "document.stale": "Your exploration has changed. This document is the previous saved version.",
  "document.failed": "Could not create the document. Your previous document is kept. Please try again.",
  "document.quota": "Generation limit reached. Sign in or check your plan.",
  "document.unavailable": "Document generation is not configured.",
  "document.invalid": "This exploration could not be read. Please try again.",
  "document.tooLarge": "This exploration is too large to summarize in one document.",
  "document.busy": "Wait for the current explanation to finish.",
  "document.empty": "Finish an explanation first.",
  "document.copyFailed": "Copy failed. You can download the document instead.",
  "document.saved": "Saved on this device",
  "document.sourcesNote": "Based on the generated explanations; check the original sources for important claims.",

  "home.tagline": "Select a phrase, then ask What or Why.",
  "home.placeholder": "What do you want to understand?",
  "home.placeholderActive": "Ask a new question…",
  "home.submit": "Explore",
  "home.guestBlocked": "You've used all {limit} trial nodes.",
  "home.guestBlockedCta": "Sign in (free) to continue exploring. Your trails are preserved.",
  "home.guestBlockedHint": "Use Log in / Sign up to continue with your email.",
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
  "auth.updatePayment": "Update payment method",
  "auth.standardNodes": "100 nodes/mo",
  "auth.proNodes": "300 nodes/mo",
  "auth.linkSent": "Login link sent to your email.",
  "auth.linkSentHint": "Open the link in the email.",
  "auth.signIn": "Log in / Sign up",
  "auth.trialLabel": "Trial",
  "auth.email": "Email address",
  "auth.callbackErrorTitle": "Sign-in link could not be verified.",
  "auth.callbackErrorBody": "The link may have expired or already been used. Please request a new one.",
  "auth.sendFailed": "Failed to send: {error}",
  "auth.billingNotReady": "Billing is being prepared.",
  "auth.error": "Error: {error}",
  "auth.notConfigured": "Supabase not configured",
  "billing.successTitle": "Checkout complete.",
  "billing.successBody": "Your plan is updating. This can take a few seconds.",
  "billing.slowNote": "Taking longer than usual. Try refreshing the page.",
  "billing.cancelTitle": "Checkout canceled.",
  "billing.cancelBody": "No payment was made and your plan was not changed.",

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
  "settings.title": "設定",
  "settings.general": "一般",
  "settings.billing": "プランとお支払い",
  "settings.account": "アカウント",
  "settings.back": "探索に戻る",
  "settings.guest": "ゲスト",
  "settings.generalIntro": "使いやすい表示に整えましょう。",
  "settings.language": "言語",
  "settings.languageHelp": "画面と新しく生成する説明に使います。保存済みの内容は元の言語のままです。",
  "settings.theme": "カラーテーマ",
  "settings.themeHelp": "このブラウザでの表示を選べます。",
  "settings.system": "端末に合わせる",
  "settings.light": "ライト",
  "settings.dark": "ダーク",
  "settings.autoSave": "変更は自動で保存されます。",
  "settings.billingIntro": "プラン、利用状況、お支払いをまとめて確認できます。",
  "settings.currentPlan": "現在のプラン",
  "settings.usage": "今月の生成回数",
  "settings.usageHelp": "説明やまとめ文書の作成で1回分を使います。保存済みの内容を開くときは消費しません。利用枠は毎月1日（UTC）にリセットされます。",
  "settings.perMonth": "／月",
  "settings.allowance": "月{count}回の生成",
  "settings.manage": "プランを管理",
  "settings.payment": "支払い方法・請求書",
  "settings.cancel": "サブスクリプションを解約",
  "settings.portalHelp": "更新日、お支払い情報、解約手続きはStripeの管理画面で確認できます。開くだけでは契約は変更されません。",
  "settings.recoverHelp": "既存のお支払い情報があります。Stripeでお支払いや契約の状況を確認してください。",
  "settings.choose": "{plan}を選ぶ",
  "settings.loading": "読み込み中…",
  "settings.opening": "開いています…",
  "settings.retry": "再試行",
  "settings.loadFailed": "プランを取得できませんでした。再試行してください。",
  "settings.billingFailed": "お支払い画面を開けませんでした。もう一度お試しください。",
  "settings.guestBilling": "ログインするとプランやお支払いを管理できます。",
  "settings.trial": "お試し利用：{used}／{limit}回",
  "settings.accountIntro": "ログイン情報と保存した探索について。",
  "settings.email": "メールアドレス",
  "settings.signedIn": "ログイン中",
  "settings.savedHelp": "探索とまとめ文書はアカウントに保存されます。",
  "settings.guestHelp": "メールのリンクでログインすると、探索とまとめ文書を別の端末でも開けます。ゲストで作成した内容も引き継がれます。",
  "settings.sending": "送信中…",
  "settings.logoutHelp": "このブラウザからログアウトします。アカウントに保存したデータは残ります。",
  "settings.logoutFailed": "ログアウトできませんでした。もう一度お試しください。",
  "settings.deleteTitle": "アカウントの削除",
  "settings.deleteHelp": "アカウントとデータの削除は、登録したメールアドレスからご依頼ください。有料プランの解約は「プランとお支払い」から行えます。",
  "settings.deleteRequest": "メールで削除を依頼",
  "settings.support": "ヘルプ・サービス情報",
  "settings.loginUnavailable": "現在ログインを利用できません。時間をおいてお試しください。",

  "document.action": "まとめる",
  "document.open": "ドキュメント",
  "document.title": "探索をドキュメントにまとめる",
  "document.intro": "探索した説明を、出典付きのひとつの文章に整理します。新たな調査は行いません。",
  "document.generate": "ドキュメントを作成",
  "document.generating": "まとめています…",
  "document.cost": "生成枠を1回分使います。アカウントに保存され、別の端末でも読めます。",
  "document.guestCost": "生成枠を1回分使います。ログインするとアカウントに保存できます。ダウンロードでも残せます。",
  "document.saving": "アカウントに保存しています…",
  "document.savedCloud": "アカウントに保存済み",
  "document.unsavedCloud": "アカウントにはまだ保存されていません",
  "document.saveFailed": "アカウントに保存できませんでした。文書はこの画面に残っています。保存を再試行するか、ダウンロードしてください。",
  "document.retrySave": "保存を再試行",
  "document.copy": "コピー",
  "document.download": ".mdで保存",
  "document.regenerate": "最新の探索で更新",
  "document.stale": "探索の内容が変わりました。表示中の文書は以前に保存したものです。",
  "document.failed": "生成できませんでした。以前の文書は保持されています。もう一度お試しください。",
  "document.quota": "生成枠の上限に達しました。ログインまたはプランをご確認ください。",
  "document.unavailable": "ドキュメント生成の設定がありません。",
  "document.invalid": "探索内容を読み取れませんでした。もう一度お試しください。",
  "document.tooLarge": "この探索は、一度にまとめられる分量を超えています。",
  "document.busy": "説明の生成が終わるまでお待ちください。",
  "document.empty": "まず説明を1つ生成してください。",
  "document.copyFailed": "コピーできませんでした。ダウンロードをご利用ください。",
  "document.saved": "この端末に保存済み",
  "document.sourcesNote": "生成された説明をもとにした文書です。重要な内容は元の出典でご確認ください。",

  "home.tagline": "わからないことを、わかるまで測深する。",
  "home.placeholder": "何を理解したいですか？",
  "home.placeholderActive": "新しい問いを立てる...",
  "home.submit": "測深",
  "home.guestBlocked": "お試し枠（{limit}ノード）を使い切りました。",
  "home.guestBlockedCta": "ログイン（無料）すると続きから探索できます。データはそのまま引き継がれます。",
  "home.guestBlockedHint": "「ログイン／登録」からメールアドレスでログインできます。",
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
  "auth.updatePayment": "支払い方法を更新",
  "auth.standardNodes": "100ノード/月",
  "auth.proNodes": "300ノード/月",
  "auth.linkSent": "ログインリンクをメールに送りました。",
  "auth.linkSentHint": "メール内のリンクを開いてください。",
  "auth.signIn": "Log in / Sign up",
  "auth.trialLabel": "お試し",
  "auth.email": "メールアドレス",
  "auth.callbackErrorTitle": "ログインリンクを確認できませんでした。",
  "auth.callbackErrorBody": "リンクの期限切れ、または使用済みの可能性があります。もう一度送信してください。",
  "auth.sendFailed": "送信に失敗しました: {error}",
  "auth.billingNotReady": "課金は現在準備中です。",
  "auth.error": "エラー: {error}",
  "auth.notConfigured": "Supabase が設定されていません",
  "billing.successTitle": "決済が完了しました。",
  "billing.successBody": "プランを反映しています。数秒かかる場合があります。",
  "billing.slowNote": "反映に時間がかかっています。ページを再読み込みしてください。",
  "billing.cancelTitle": "決済をキャンセルしました。",
  "billing.cancelBody": "支払いは行われておらず、プランは変更されていません。",

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
  const languageRevision = useRef(0);

  // Read stored locale on mount (avoids SSR hydration mismatch)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      let stored: string | null = null;
      try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
      if (stored === "en" || stored === "ja") {
        setLocaleRaw(stored);
        document.documentElement.lang = stored;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (auth.kind !== "signedIn") return;
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;
    const revision = languageRevision.current;
    supabase
      .from("profiles")
      .select("locale")
      .single()
      .then(({ data }) => {
        if (cancelled || revision !== languageRevision.current) return;
        if (data?.locale && (data.locale === "en" || data.locale === "ja")) {
          setLocaleRaw(data.locale);
          try { localStorage.setItem(STORAGE_KEY, data.locale); } catch {}
          document.documentElement.lang = data.locale;
        }
      });
    return () => { cancelled = true; };
  }, [auth]);

  const setLocale = useCallback(
    (l: Locale) => {
      languageRevision.current += 1;
      setLocaleRaw(l);
      try { localStorage.setItem(STORAGE_KEY, l); } catch {}
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
  const displayed = document.documentElement.lang;
  if (displayed === "en" || displayed === "ja") return displayed;
  try { return localStorage.getItem(STORAGE_KEY) === "ja" ? "ja" : "en"; } catch { return "en"; }
}
