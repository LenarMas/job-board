import { NextResponse } from "next/server";
import { DEFAULT_STAGES } from "@jobtrack/core";
import { extensionCorsHeaders, preflight, rejectDisallowed } from "@/lib/extension-cors";
import { getServices } from "@/lib/services";

/**
 * Capture endpoint for the browser extension. Localhost-only, no auth;
 * origin rules live in lib/extension-cors.
 */

export async function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  const rejected = rejectDisallowed(request);
  if (rejected) return rejected;
  const headers = extensionCorsHeaders(request);

  const body = await request.json().catch(() => null);
  if (!body?.title || typeof body.title !== "string") {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400, headers },
    );
  }

  const svc = getServices();
  const url = typeof body.url === "string" && body.url ? body.url : undefined;

  if (url) {
    const existing = svc.findJobByUrl(url);
    if (existing) {
      return NextResponse.json(
        { job: existing, duplicate: true },
        { status: 200, headers },
      );
    }
  }

  const stage = (DEFAULT_STAGES as readonly string[]).includes(body.stage)
    ? body.stage
    : "wishlist";
  const job = svc.createJob({
    title: body.title,
    company: body.company || undefined,
    stageName: stage,
    location: body.location || undefined,
    url,
    salary: body.salary || undefined,
    description: body.description || undefined,
  });
  return NextResponse.json({ job, duplicate: false }, { status: 201, headers });
}
