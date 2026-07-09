// プロフィールキャッシュのユーザー境界。共有ブラウザで A のキャッシュを B が読まないように
// キーを user id で分離し、認証遷移時にはこの名前空間ごと消去する。詳細は
// docs/hotfix-cross-user-storage.md (B2)。

export const PROFILE_CACHE_BASE = "sondeur.profile.cache";

// userId をペイロードにも含める。localStorage 側の key で分離するのは第一防壁だが、
// render 時に profile.userId === auth.userId を再チェックする第二防壁を成立させるため。
// React の useEffect は render の後で走るので、auth prop 変更直後の render では
// state 側の profile は前ユーザーのまま残る。key で isolate されていても component が
// 前ユーザーの plan を一瞬でも表示すれば漏洩する。この二段構えで塞ぐ。
export type CachedProfile = {
  userId: string;
  plan: string;
  used: number;
  hasStripe: boolean;
  monthKey: string;
};

function perUserKey(userId: string): string {
  return `${PROFILE_CACHE_BASE}.${userId}`;
}

export function loadCachedProfile(userId: string): CachedProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(perUserKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedProfile> | null;
    // shape 検証: userId が一致し、必要フィールドが揃っている時だけ返す
    if (
      !parsed ||
      parsed.userId !== userId ||
      typeof parsed.plan !== "string" ||
      typeof parsed.used !== "number" ||
      typeof parsed.hasStripe !== "boolean" ||
      typeof parsed.monthKey !== "string"
    ) {
      return null;
    }
    return parsed as CachedProfile;
  } catch {
    return null;
  }
}

export function saveCachedProfile(userId: string, p: CachedProfile): void {
  if (typeof window === "undefined") return;
  if (p.userId !== userId) return; // 契約違反は sink しない
  try {
    window.localStorage.setItem(perUserKey(userId), JSON.stringify(p));
  } catch {
    // quota 超過等は無視
  }
}

/** render 時の第二防壁: profile が現在の userId のものでなければ null を返す。 */
export function resolveDisplayProfile(
  profile: CachedProfile | null,
  authUserId: string
): CachedProfile | null {
  return profile && profile.userId === authUserId ? profile : null;
}

export function clearAllCachedProfiles(): void {
  if (typeof window === "undefined") return;
  try {
    // Object.keys(localStorage) を先に配列化してから removeItem する。iterate 中の
    // 削除で index がずれる問題を避けるため。
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k !== null) keys.push(k);
    }
    for (const k of keys) {
      if (k === PROFILE_CACHE_BASE || k.startsWith(`${PROFILE_CACHE_BASE}.`)) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    // 何もしない
  }
}
