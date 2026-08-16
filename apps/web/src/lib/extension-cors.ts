import "server-only";
import { NextResponse } from "next/server";

/**
 * Guards for endpoints the browser extension calls. The app is
 * localhost-only and unauthenticated, so: requests must arrive on a
 * localhost host, and cross-origin browser requests are allowed only from
 * chrome-extension origins. Same-machine tools (curl) send no Origin header
 * and pass through.
 */

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
// Browsers send an Origin header on ALL non-GET requests, including
// same-origin ones — the app's own pages must not be rejected.
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function isLocalhost(request: Request): boolean {
  return LOCALHOST.test(request.headers.get("host") ?? "");
}

function originAllowed(origin: string): boolean {
  return EXTENSION_ORIGIN.test(origin) || LOCALHOST_ORIGIN.test(origin);
}

export function extensionCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !EXTENSION_ORIGIN.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

/** Returns an error response when the request must be rejected, else null. */
export function rejectDisallowed(request: Request): NextResponse | null {
  if (!isLocalhost(request)) {
    return NextResponse.json({ error: "localhost only" }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin && !originAllowed(origin)) {
    return NextResponse.json({ error: "origin not allowed" }, { status: 403 });
  }
  return null;
}

export function preflight(request: Request): NextResponse {
  const rejected = rejectDisallowed(request);
  if (rejected) return rejected;
  const headers = extensionCorsHeaders(request);
  if (Object.keys(headers).length === 0) {
    return NextResponse.json({ error: "origin not allowed" }, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers });
}
