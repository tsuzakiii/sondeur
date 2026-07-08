export type BillingReturnStatus = "success" | "cancel";

const BILLING_RETURN_KEY = "sondeur.billing.return";

function normalize(value: string | null): BillingReturnStatus | null {
  return value === "success" || value === "cancel" ? value : null;
}

export function readBillingReturnStatus(): BillingReturnStatus | null {
  if (typeof window === "undefined") return null;
  const fromUrl = normalize(new URLSearchParams(window.location.search).get("billing"));
  if (fromUrl) return fromUrl;
  try {
    return normalize(sessionStorage.getItem(BILLING_RETURN_KEY));
  } catch {
    return null;
  }
}

export function rememberBillingReturnStatus(status: BillingReturnStatus) {
  try {
    sessionStorage.setItem(BILLING_RETURN_KEY, status);
  } catch {}
}

export function clearBillingReturnStatus() {
  try {
    sessionStorage.removeItem(BILLING_RETURN_KEY);
  } catch {}
}
