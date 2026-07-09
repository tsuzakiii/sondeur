// billing-success 後の profile polling で、想定より時間がかかっている時に
// UI に補助テキスト (i18n key: billing.slowNote) を出すかどうかを判定する。
// polling が既に成功して plan が "free" 以外になった時は false を返し、note は
// 消える。詳細は docs/fix-mixed-cleanups.md (M4)。

const SLOW_NOTE_THRESHOLD_ATTEMPT = 10;

export function shouldShowSlowNote(attempt: number, plan: string | null | undefined): boolean {
  return attempt >= SLOW_NOTE_THRESHOLD_ATTEMPT && plan === "free";
}
