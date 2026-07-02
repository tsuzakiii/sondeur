"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// root layout ごと落ちた時のフォールバック。i18n Provider の外なので t() は使えず英語ハードコード。
// global-error は自前で <html>/<body> を持つ必要がある (root layout を置き換えるため)。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#e8ecf3", minHeight: "100dvh" }}>
        <div
          style={{
            display: "flex",
            height: "100dvh",
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "384px",
              width: "100%",
              borderRadius: "16px",
              background: "#e8ecf3",
              boxShadow: "8px 8px 16px #c5c9d3, -8px -8px 16px #ffffff",
              padding: "32px",
              textAlign: "center",
            }}
          >
            <h1 style={{ fontSize: "16px", fontWeight: 700, color: "#334155", margin: 0 }}>
              Something went wrong
            </h1>
            <p style={{ marginTop: "8px", fontSize: "12.5px", lineHeight: "24px", color: "#94a3b8" }}>
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: "20px",
                borderRadius: "12px",
                background: "#1e2a4a",
                color: "#ffffff",
                fontSize: "12.5px",
                fontWeight: 500,
                padding: "10px 20px",
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
