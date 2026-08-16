import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  getServices().deleteStageEvent(Number(id));
  return NextResponse.json({ ok: true });
}
