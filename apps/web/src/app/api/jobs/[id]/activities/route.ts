import { NextResponse } from "next/server";
import { activityCategories, type ActivityCategory } from "@jobtrack/core";
import { getServices } from "@/lib/services";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return NextResponse.json(getServices().listActivities(Number(id)));
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  if (!body.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const category: ActivityCategory = activityCategories.includes(body.category)
    ? body.category
    : "other";
  const activity = getServices().createActivity({
    jobId: Number(id),
    category,
    title: body.title,
    note: body.note || undefined,
    dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
  });
  return NextResponse.json(activity, { status: 201 });
}
