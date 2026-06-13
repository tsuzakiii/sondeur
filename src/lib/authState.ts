"use client";

import { useSyncExternalStore } from "react";
import { getSupabase } from "./supabase/client";
import { startSync, stopSync } from "./sync";

/**
 * 認証状態のモジュールレベルストア。
 * リスナーはアプリのルート (page.tsx) から initAuth() で一度だけ登録するので、
 * サイドバーの開閉等で UI コンポーネントがアンマウントされても認証/同期は維持される。
 */

export type AuthInfo =
  | { kind: "signedOut" }
  | { kind: "signedIn"; email: string };

const SIGNED_OUT: AuthInfo = { kind: "signedOut" };
let authInfo: AuthInfo = SIGNED_OUT;
const listeners = new Set<() => void>();
let initialized = false;

function emit() {
  for (const l of listeners) l();
}

export function initAuth() {
  if (initialized) return;
  const supabase = getSupabase();
  if (!supabase) return;
  initialized = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      const next: AuthInfo = { kind: "signedIn", email: session.user.email ?? "" };
      if (authInfo.kind !== "signedIn" || authInfo.email !== next.email) {
        authInfo = next;
        emit();
        void startSync(session.user.id);
      }
    } else {
      if (authInfo.kind !== "signedOut") {
        authInfo = SIGNED_OUT;
        emit();
      }
      stopSync();
    }
  });
}

export function useAuthInfo(): AuthInfo {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => authInfo,
    () => SIGNED_OUT
  );
}

export async function signInWithEmail(email: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "Supabase が設定されていません";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return error ? error.message : null;
}

export function signOut() {
  void getSupabase()?.auth.signOut();
}
