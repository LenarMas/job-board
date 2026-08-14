import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "title", "email", "phone", "linkedin", "notes"]) {
    if (key in body) patch[key] = body[key] || null;
  }
  const contact = getServices().updateContact(Number(id), patch);
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(contact);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  getServices().deleteContact(Number(id));
  return NextResponse.json({ ok: true });
}
