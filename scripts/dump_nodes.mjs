// Supabase から全ノードを取得して表示
// 実行: node --env-file=.env.local scripts/dump_nodes.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: trees } = await supabase
  .from("trees")
  .select("*")
  .order("updated_at", { ascending: false });

for (const tree of trees ?? []) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Tree: ${tree.title} (${tree.id})`);
  console.log(`Created: ${tree.created_at}`);

  const { data: nodes } = await supabase
    .from("nodes")
    .select("*")
    .eq("tree_id", tree.id)
    .order("created_at", { ascending: true });

  for (const node of nodes ?? []) {
    const type = node.edge_type ?? "root";
    const label = node.label ?? "";
    console.log(`\n  [${type}] ${label}`);
    if (node.question) console.log(`  質問: ${node.question}`);
    console.log(`  ${(node.content ?? "").slice(0, 300)}${(node.content ?? "").length > 300 ? "..." : ""}`);
  }
}

console.log(`\n\nTotal: ${trees?.length ?? 0} trees`);
