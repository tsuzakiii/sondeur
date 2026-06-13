"use client";

import { useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { signInWithEmail, signOut, useAuthInfo } from "@/lib/authState";

export default function AuthFooter() {
  const auth = useAuthInfo();
  const [email, setEmail] = useState("");
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState(false);

  if (!isSupabaseConfigured()) return null;

  if (auth.kind === "signedIn") {
    return (
      <div className="border-t border-[#d8dde8] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] text-slate-400" title={auth.email}>
            {auth.email}
          </span>
          <button
            onClick={signOut}
            className="shrink-0 text-[11px] text-slate-400 transition-colors hover:text-wine"
          >
            ログアウト
          </button>
        </div>
        <div className="mt-0.5 text-[10px] text-slate-300">クラウド同期中</div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="border-t border-[#d8dde8] px-4 py-3 text-[11px] leading-5 text-slate-400">
        ログインリンクをメールに送りました。
        <br />
        メール内のリンクを開いてください。
      </div>
    );
  }

  return (
    <div className="border-t border-[#d8dde8] px-3 py-3">
      {asking ? (
        <input
          autoFocus
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAsking(false);
            if (e.key === "Enter" && email.includes("@")) {
              void signInWithEmail(email.trim()).then((err) => {
                if (err) alert(`送信に失敗しました: ${err}`);
                else setSent(true);
              });
            }
          }}
          placeholder="メールアドレス"
          className="neu-inset w-full rounded-lg px-2.5 py-1 text-[12px] text-slate-700 placeholder-slate-400 outline-none"
        />
      ) : (
        <button
          onClick={() => setAsking(true)}
          className="w-full rounded-lg py-1 text-[12px] text-slate-400 transition-colors hover:text-navy"
        >
          ログインして航跡をクラウドに保存
        </button>
      )}
    </div>
  );
}
