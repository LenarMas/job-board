import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { documentKinds, type DocumentKind } from "@jobtrack/core";
import { getServices } from "@/lib/services";
import { uploadsDir } from "@/lib/uploads";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return NextResponse.json(getServices().listDocuments(Number(id)));
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const jobId = Number(id);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const kindRaw = String(form.get("kind") ?? "other");
  const kind: DocumentKind = (documentKinds as readonly string[]).includes(kindRaw)
    ? (kindRaw as DocumentKind)
    : "other";
  const filename = path.basename(file.name) || "upload";
  const dir = path.join(uploadsDir(), String(jobId));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
  const doc = getServices().createDocument({
    jobId,
    kind,
    filename,
    path: path.relative(uploadsDir(), filePath),
  });
  return NextResponse.json(doc, { status: 201 });
}
