import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return NextResponse.json(getServices().listNotes(Number(id)));
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  if (!body.body || typeof body.body !== "string") {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  const note = getServices().createNote({ jobId: Number(id), body: body.body });
  return NextResponse.json(note, { status: 201 });
}
