import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const job = getServices().createJob({
    title: body.title,
    company: body.company || undefined,
    stageName: body.stageName || undefined,
    stageId: body.stageId || undefined,
    location: body.location || undefined,
    url: body.url || undefined,
    salary: body.salary || undefined,
  });
  return NextResponse.json(job, { status: 201 });
}
