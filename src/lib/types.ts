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
}

export interface ExpandRequest {
  /** ルートからのパス上のノード要約 (各50字程度) */
  pathSummaries: string[];
  /** 親ノード本文 */
  parentContent: string;
  /** 祖父ノード本文 (あれば) */
  grandparentContent: string | null;
  /** 選択スパン (root の場合は質問文そのもの、span なしの ask は "") */
  selectedSpan: string;
  /** ask の場合のユーザーの自由質問文 */
  question?: string | null;
  /** 親ノードID (root 以外)。ログイン時のプラン制限チェックに使う */
  parentId?: string | null;
  operation: EdgeType;
}
