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

  const { error } = await auth.supabase
    .from("trees")
    .update({ shared: body.shared })
    .eq("id", body.treeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
