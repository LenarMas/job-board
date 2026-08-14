import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getServices().boardSnapshot());
}
