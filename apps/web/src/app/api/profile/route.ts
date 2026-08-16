import { NextResponse } from "next/server";
import { extensionCorsHeaders, preflight, rejectDisallowed } from "@/lib/extension-cors";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

const FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "location",
  "linkedin",
  "github",
  "website",
] as const;

export async function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  const rejected = rejectDisallowed(request);
  if (rejected) return rejected;
  const row = getServices().getProfile();
  // resumePath is a server detail; the extension only needs the filename.
  const { resumePath, ...rest } = row;
  void resumePath;
  return NextResponse.json(rest, { headers: extensionCorsHeaders(request) });
}

export async function PUT(request: Request) {
  const rejected = rejectDisallowed(request);
  if (rejected) return rejected;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const patch: Record<string, string | null> = {};
  for (const key of FIELDS) {
    if (key in body) patch[key] = body[key] || null;
  }
  const row = getServices().saveProfile(patch);
  const { resumePath, ...rest } = row;
  void resumePath;
  return NextResponse.json(rest);
}
