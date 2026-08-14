import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const note = getServices().updateNote(Number(id), body.body ?? "");
  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(note);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  getServices().deleteNote(Number(id));
  return NextResponse.json({ ok: true });
}
