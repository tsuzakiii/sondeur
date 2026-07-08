import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearBillingReturnStatus,
  readBillingReturnStatus,
  rememberBillingReturnStatus,
} from "@/lib/billingReturn";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

function stubBrowser(search = "") {
  vi.stubGlobal("window", { location: { search } });
  vi.stubGlobal("sessionStorage", new MemoryStorage());
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("billing return status", () => {
  it("reads success from the billing query string", () => {
    stubBrowser("?billing=success");
    expect(readBillingReturnStatus()).toBe("success");
  });

  it("reads cancel from the billing query string", () => {
    stubBrowser("?billing=cancel");
    expect(readBillingReturnStatus()).toBe("cancel");
  });

  it("ignores unknown billing query values", () => {
    stubBrowser("?billing=paid");
    expect(readBillingReturnStatus()).toBeNull();
  });

  it("falls back to session storage after the URL is cleaned", () => {
    stubBrowser("");
    rememberBillingReturnStatus("success");
    expect(readBillingReturnStatus()).toBe("success");
    clearBillingReturnStatus();
    expect(readBillingReturnStatus()).toBeNull();
  });
});
