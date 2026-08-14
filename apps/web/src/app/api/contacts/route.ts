import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getServices().listContacts());
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const contact = getServices().createContact({
    name: body.name,
    title: body.title || undefined,
    email: body.email || undefined,
    phone: body.phone || undefined,
    linkedin: body.linkedin || undefined,
    notes: body.notes || undefined,
  });
  return NextResponse.json(contact, { status: 201 });
}
