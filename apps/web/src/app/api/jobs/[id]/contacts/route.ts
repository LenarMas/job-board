import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return NextResponse.json(getServices().listContactsForJob(Number(id)));
}

/** Link an existing contact (contactId) or create-and-link (name, ...). */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const jobId = Number(id);
  const body = await request.json();
  const svc = getServices();
  let contactId: number;
  if (body.contactId) {
    contactId = Number(body.contactId);
  } else if (body.name) {
    contactId = svc.createContact({
      name: body.name,
      title: body.title || undefined,
      email: body.email || undefined,
      phone: body.phone || undefined,
      linkedin: body.linkedin || undefined,
    }).id;
  } else {
    return NextResponse.json(
      { error: "contactId or name is required" },
      { status: 400 },
    );
  }
  svc.linkContact(jobId, contactId);
  return NextResponse.json(svc.listContactsForJob(jobId), { status: 201 });
}
