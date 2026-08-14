import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  if (!body.stageId && !body.stageName) {
    return NextResponse.json(
      { error: "stageId or stageName is required" },
      { status: 400 },
    );
  }
  try {
    const job = getServices().moveJob(Number(id), {
      stageId: body.stageId,
      stageName: body.stageName,
      index: body.index,
    });
    return NextResponse.json(job);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "move failed" },
      { status: 400 },
    );
  }
}
