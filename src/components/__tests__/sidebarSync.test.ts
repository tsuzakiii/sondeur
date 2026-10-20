import { beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ kind: "signedIn", ready: true, sync: "loading" }));
vi.mock("@/lib/authState", () => ({ useAuthInfo: () => ({ kind: state.kind }), useAuthReady: () => state.ready }));
vi.mock("@/lib/syncStatus", () => ({ useSyncStatus: () => state.sync }));
vi.mock("@/lib/sync", () => ({ retrySync: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/AuthFooter", () => ({ default: () => null }));
import Sidebar from "../Sidebar";
const render = () => renderToStaticMarkup(createElement(Sidebar, {
  open: true, trees: [], selectedTreeId: null,
  onToggle: vi.fn(), onSelectTree: vi.fn(), onSelectNode: vi.fn(),
  onNewTree: vi.fn(), onNewNote: vi.fn(), onDeleteTree: vi.fn(),
}));
beforeEach(() => { state.kind = "signedIn"; state.ready = true; state.sync = "loading"; });

it("does not present a loading or failed snapshot as an empty account", () => {
  expect(render()).toContain("sidebar.loading");
  expect(render()).not.toContain("sidebar.empty");
  state.sync = "error";
  expect(render()).toContain("sidebar.loadFailed");
  expect(render()).toContain("error.retry");
  expect(render()).not.toContain("sidebar.empty");
});
it("shows empty state only after loading succeeds or guest auth is confirmed", () => {
  state.sync = "ready";
  expect(render()).toContain("sidebar.empty");
  state.kind = "signedOut";
  state.ready = false;
  expect(render()).not.toContain("sidebar.empty");
  state.ready = true;
  expect(render()).toContain("sidebar.empty");
});
