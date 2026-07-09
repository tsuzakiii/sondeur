"use client";

import { useSyncExternalStore } from "react";
import { getSupabase } from "./supabase/client";
import { startSync, stopSync } from "./sync";
import { clearAllCachedProfiles } from "@/components/authFooterCache";

/**
 * 認証状態のモジュールレベルストア。
 * リスナーはアプリのルート (page.tsx) から initAuth() で一度だけ登録するので、
 * サイドバーの開閉等で UI コンポーネントがアンマウントされても認証/同期は維持される。
 */

export type AuthInfo =
  | { kind: "signedOut" }
  | { kind: "signedIn"; userId: string; email: string };

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
      const next: AuthInfo = {
        kind: "signedIn",
        userId: session.user.id,
        email: session.user.email ?? "",
      };
      if (authInfo.kind === "signedIn" && authInfo.userId !== next.userId) {
        stopSync({ clearLocal: true });
      }
      if (
        authInfo.kind !== "signedIn" ||
        authInfo.userId !== next.userId ||
        authInfo.email !== next.email
      ) {
        authInfo = next;
        emit();
        void startSync(session.user.id);
      }
    } else {
      if (authInfo.kind !== "signedOut") {
        // 明示的な signedIn → signedOut 遷移。この認証層で cache 名前空間を掃除しておく
        // ことで、AuthFooter が unmount 中 (mobile sidebar 折り畳み等) に他 tab で発生した
        // signout も正しく捕まえる。UI コンポーネント側の観測に依存しない。
        clearAllCachedProfiles();
        authInfo = SIGNED_OUT;
        emit();
        stopSync({ clearLocal: true });
      } else {
        stopSync();
      }
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
