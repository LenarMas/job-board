import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const job = getServices().getJob(Number(id));
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["title", "location", "url", "salary", "color", "description", "company"]) {
    if (key in body) patch[key] = body[key] || null;
  }
  if ("deadline" in body) {
    patch.deadline = body.deadline ? new Date(body.deadline) : null;
  }
  const job = getServices().updateJob(Number(id), patch);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  getServices().deleteJob(Number(id));
  return NextResponse.json({ ok: true });
}
