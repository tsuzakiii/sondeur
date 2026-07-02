export type EdgeType = "root" | "what" | "why" | "ask";

export type NodeStatus = "streaming" | "done" | "error";

export interface SondeurNode {
  id: string;
  treeId: string;
  parentId: string | null; // null = root
  edgeType: EdgeType;
  /** 親ノード本文中の選択文字列 (root の場合はユーザーの質問文、span なしの ask は "") */
  selectedSpan: string;
  /** 親本文内のオフセット (root / span なしの ask は -1) */
  spanStart: number;
  spanEnd: number;
  /** ask の場合のユーザーの自由質問文 */
  question?: string;
  /** AI応答本文 */
  content: string;
  status: NodeStatus;
  /** グラフ上でこのノードの子孫を畳んでいるか */
  collapsed: boolean;
  createdAt: number;
}

export interface Tree {
  id: string;
  title: string;
  rootNodeId: string;
  nodes: Record<string, SondeurNode>;
  createdAt: number;
  updatedAt: number;
  shared?: boolean;
}

export interface ExpandRequest {
  pathSummaries: string[];
  parentContent: string;
  grandparentContent: string | null;
  selectedSpan: string;
  question?: string | null;
  parentId?: string | null;
  operation: EdgeType;
  lang?: string;
}
