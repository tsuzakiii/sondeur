import { NextResponse } from "next/server";
import { getRequestUser, isSupabaseConfiguredServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  if (!isSupabaseConfiguredServer()) {
    return NextResponse.json({ error: "not configured" }, { status: 501 });
  }
  const auth = await getRequestUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { treeId?: string; shared?: boolean } | null;
  if (!body?.treeId || typeof body.shared !== "boolean") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("trees")
    .update({ shared: body.shared })
    .eq("id", body.treeId)
    .eq("user_id", auth.user.id) // 明示的な所有者条件 (RLS への防御的二重化)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
