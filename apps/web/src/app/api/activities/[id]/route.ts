import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  if ("title" in body) patch.title = body.title;
  if ("note" in body) patch.note = body.note || null;
  if ("category" in body) patch.category = body.category;
  if ("dueAt" in body) patch.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  if ("completed" in body) {
    patch.completedAt = body.completed ? new Date() : null;
  }
  const activity = getServices().updateActivity(Number(id), patch);
  if (!activity) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(activity);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  getServices().deleteActivity(Number(id));
  return NextResponse.json({ ok: true });
}
