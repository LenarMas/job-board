import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

type Params = { params: Promise<{ id: string; contactId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id, contactId } = await params;
  getServices().unlinkContact(Number(id), Number(contactId));
  return NextResponse.json({ ok: true });
}
