---
status: implemented
severity: Low
area: api correctness
files: src/app/api/share/route.ts
---

# share API が他人の treeId に対しても ok:true を返す

## 問題
`src/app/api/share/route.ts:16-23` — `treeId` をボディから受け取り `update({ shared }).eq("id", treeId)` を実行。所有者チェックがコードに無い。RLS (`own trees` ポリシー) が他人ツリーの実更新をブロックするため**実データ改変はされない**が、RLS で 0 行更新でもエラーにならないため、他人/存在しない treeId に対しても `{ ok: true }` が返る。treeId の存在推測の材料になり得るし、クライアントは成功したと誤認する。

## 修正設計
更新行数を検証して 0 行なら 404:

```ts
const { data, error } = await auth.supabase
  .from("trees")
  .update({ shared: body.shared })
  .eq("id", body.treeId)
  .eq("user_id", auth.user.id)   // 明示的な所有者条件 (RLS への防御的二重化)
  .select("id");

if (error) return NextResponse.json({ error: error.message }, { status: 500 });
if (!data || data.length === 0) {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}
return NextResponse.json({ ok: true });
```

- 存在しない/他人の treeId は区別せず一律 404 (存在の有無を漏らさない)
- 呼び出し側 (クライアント) が `ok` 以外をどう扱うか確認し、404 でクラッシュしないことを確かめる (`grep -rn "api/share" src/` で呼び出し箇所を特定して読むこと)

## 受け入れ条件
- 自分のツリー: 従来通り ok:true で shared が切り替わる
- 他人/存在しない treeId: 404
- クライアント側がエラー時に安全に振る舞う (必要ならエラーハンドリングを1箇所追加)
