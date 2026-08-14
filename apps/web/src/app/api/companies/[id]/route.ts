import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const company = getServices().getCompany(Number(id));
  if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(company);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "website", "type", "address", "country", "notes"]) {
    if (key in body) patch[key] = body[key] || null;
  }
  const company = getServices().updateCompany(Number(id), patch);
  if (!company) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(company);
}
