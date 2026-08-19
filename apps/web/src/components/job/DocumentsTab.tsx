"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DocumentData } from "@/lib/detail-types";
import { ConfirmDialog } from "../ConfirmDialog";

const KINDS = [
  { value: "resume", label: "Resume" },
  { value: "cover_letter", label: "Cover letter" },
  { value: "other", label: "Other" },
] as const;

export function DocumentsTab({
  jobId,
  documents,
}: {
  jobId: number;
  documents: DocumentData[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<string>("resume");
  const [uploading, setUploading] = useState(false);

  async function upload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    await fetch(`/api/jobs/${jobId}/documents`, { method: "POST", body: form });
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
    router.refresh();
  }

  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  async function remove(id: number) {
    setConfirmingId(null);
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input ref={fileInput} type="file" className="text-sm" aria-label="Choose file" />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <button
          onClick={upload}
          disabled={uploading}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
      <ul className="space-y-2">
        {documents.map((d) => (
          <li key={d.id} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {KINDS.find((k) => k.value === d.kind)?.label ?? d.kind}
            </span>
            <a href={`/api/documents/${d.id}`} className="flex-1 truncate text-sm text-indigo-600 hover:underline">
              {d.filename}
            </a>
            <span className="text-xs text-slate-400">{d.createdAt.slice(0, 10)}</span>
            <button
              onClick={() => setConfirmingId(d.id)}
              className="text-xs text-slate-300 hover:text-red-500"
              aria-label={`Delete ${d.filename}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {documents.length === 0 && (
        <p className="text-sm text-slate-400">No documents yet.</p>
      )}
      <ConfirmDialog
        open={confirmingId !== null}
        title="Delete this document?"
        body="The file is removed permanently."
        onConfirm={() => confirmingId !== null && remove(confirmingId)}
        onCancel={() => setConfirmingId(null)}
      />
    </div>
  );
}
