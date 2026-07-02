import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export function isSupabaseConfiguredServer(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

/** Route Handler 用の Supabase クライアント (リクエストの認証Cookieでユーザーとして振る舞う) */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfiguredServer()) return null;
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Route Handler 内ではセッション更新によるCookie書き換えは行わない
        },
      },
    }
  );
}

export async function getRequestUser(): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}
