import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { extensionCorsHeaders, preflight, rejectDisallowed } from "@/lib/extension-cors";
import { getServices } from "@/lib/services";
import { uploadsDir } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
};

export async function OPTIONS(request: Request) {
  return preflight(request);
}

export async function GET(request: Request) {
  const rejected = rejectDisallowed(request);
  if (rejected) return rejected;
  const profile = getServices().getProfile();
  if (!profile.resumePath) {
    return NextResponse.json({ error: "no resume uploaded" }, { status: 404 });
  }
  const filePath = path.join(uploadsDir(), profile.resumePath);
  if (!filePath.startsWith(uploadsDir()) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "resume file missing" }, { status: 404 });
  }
  const ext = path.extname(profile.resumeFilename ?? "").toLowerCase();
  return new NextResponse(fs.readFileSync(filePath), {
    headers: {
      ...extensionCorsHeaders(request),
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(profile.resumeFilename ?? "resume")}"`,
    },
  });
}

export async function POST(request: Request) {
  const rejected = rejectDisallowed(request);
  if (rejected) return rejected;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const filename = path.basename(file.name) || "resume";
  const dir = path.join(uploadsDir(), "profile");
  fs.mkdirSync(dir, { recursive: true });
  const previous = getServices().getProfile().resumePath;
  fs.writeFileSync(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  if (previous && previous !== path.join("profile", filename)) {
    const oldPath = path.join(uploadsDir(), previous);
    if (oldPath.startsWith(uploadsDir()) && fs.existsSync(oldPath)) fs.rmSync(oldPath);
  }
  const row = getServices().saveProfile({
    resumeFilename: filename,
    resumePath: path.join("profile", filename),
  });
  return NextResponse.json({ resumeFilename: row.resumeFilename }, { status: 201 });
}
