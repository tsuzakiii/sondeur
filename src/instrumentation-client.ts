import * as Sentry from "@sentry/nextjs";

// DSN未設定時は init を呼ばない = SDKは完全にno-op (captureException等は安全に何もしない)。
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // ソースマップアップロード (SENTRY_AUTH_TOKEN) は未設定のため、
    // 本番でもスタックトレースはビルド出力のまま (難読化される可能性あり)。
  });
}

export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse"
) {
  if (!dsn) return;
  Sentry.captureRouterTransitionStart(url, navigationType);
}
