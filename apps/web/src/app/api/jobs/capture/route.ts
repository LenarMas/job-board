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

  // The same posting shows up at several URLs (ATS page vs LinkedIn listing,
  // re-posted LinkedIn ids), so dedupe by url OR company+title, not url alone.
  // The existing card is returned untouched — in particular its stage stays,
  // so re-capturing an applied job never drags it back to wishlist.
  const existing = svc.findMatchingJob({
    title: body.title,
    company: typeof body.company === "string" && body.company ? body.company : undefined,
    url,
  });
  if (existing) {
    return NextResponse.json(
      { job: existing.job, duplicate: true, matchedOn: existing.matchedOn },
      { status: 200, headers },
    );
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
    // Saving straight into applied means the user applied themselves.
    source: stage === "applied" ? "applied" : undefined,
  });
  return NextResponse.json({ job, duplicate: false }, { status: 201, headers });
}
