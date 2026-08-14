import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getServices } from "@/lib/services";
import { uploadsDir } from "@/lib/uploads";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const doc = getServices().getDocument(Number(id));
  if (!doc?.path) return NextResponse.json({ error: "not found" }, { status: 404 });
  const filePath = path.join(uploadsDir(), doc.path);
  if (!filePath.startsWith(uploadsDir()) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
  const data = fs.readFileSync(filePath);
  return new NextResponse(data, {
    headers: {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.filename)}"`,
      "Content-Type": "application/octet-stream",
    },
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const doc = getServices().deleteDocument(Number(id));
  if (doc?.path) {
    const filePath = path.join(uploadsDir(), doc.path);
    if (filePath.startsWith(uploadsDir()) && fs.existsSync(filePath)) {
      fs.rmSync(filePath);
    }
  }
  return NextResponse.json({ ok: true });
}
