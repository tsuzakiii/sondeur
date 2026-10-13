import { NextResponse } from "next/server";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * メール認証リンクの着地点。
 * - token_hash 方式 (メールテンプレートを {{ .TokenHash }} リンクに変更して使う):
 *   サーバー側で verifyOtp するので PKCE の「リンク申請と同じブラウザ縛り」が無く、
 *   スマホのメールアプリで開いてもログインできる。
 * - code 方式 (旧テンプレート {{ .ConfirmationURL }} のフォールバック):
 *   PKCE 交換。テンプレート未変更でも動くように残す。
 * 失敗時は /?auth_error=<code> に落として UI 側でメッセージを出す (無言失敗の禁止)。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  const redirectTo = (path: string) => {
    const response = NextResponse.redirect(new URL(path, url.origin));
    // This response can contain a session cookie. Never cache the callback.
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const fail = (reason: string) => redirectTo(`/?auth_error=${encodeURIComponent(reason)}`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return fail("not_configured");

  // セッション Cookie はこのリダイレクトレスポンスに載せて返す
  const redirect = redirectTo("/");
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("cookie") ?? "").map((c) => ({
          name: c.name,
          value: c.value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) {
          redirect.cookies.set(c.name, c.value, c.options);
        }
      },
    },
  });

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail(error.code ?? "verify_failed");
    return redirect;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.code ?? "exchange_failed");
    return redirect;
  }

  return fail("missing_token");
}
