import { NextResponse } from "next/server";
import { DEFAULT_STAGES } from "@jobtrack/core";
import { getServices } from "@/lib/services";

/**
 * Capture endpoint for the browser extension. Localhost-only, no auth:
 * requests must arrive on a localhost host, and CORS is granted only to
 * chrome-extension origins.
 */

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function corsHeaders(request: Request): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (!origin || !EXTENSION_ORIGIN.test(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function isLocalhost(request: Request): boolean {
  return LOCALHOST.test(request.headers.get("host") ?? "");
}

export async function OPTIONS(request: Request) {
  if (!isLocalhost(request)) {
    return NextResponse.json({ error: "localhost only" }, { status: 403 });
  }
  const headers = corsHeaders(request);
  if (!headers) {
    return NextResponse.json({ error: "origin not allowed" }, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request) {
  if (!isLocalhost(request)) {
    return NextResponse.json({ error: "localhost only" }, { status: 403 });
  }
  // A browser request carries an Origin header and must pass the CORS gate;
  // same-machine tools (curl, scripts) send none and are allowed through.
  const origin = request.headers.get("origin");
  const headers = corsHeaders(request) ?? {};
  if (origin && !EXTENSION_ORIGIN.test(origin)) {
    return NextResponse.json({ error: "origin not allowed" }, { status: 403 });
  }

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
