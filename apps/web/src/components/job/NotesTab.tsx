"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { NoteData } from "@/lib/detail-types";

export function NotesTab({ jobId, notes }: { jobId: number; notes: NoteData[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");

  async function create() {
    if (!draft.trim()) return;
    await fetch(`/api/jobs/${jobId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft }),
    });
    setDraft("");
    router.refresh();
  }

  async function saveEdit(id: number) {
    await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editBody }),
    });
    setEditingId(null);
    router.refresh();
  }

  async function remove(id: number) {
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Take a note… (markdown: **bold**, *italic*, - lists)"
          className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={create}
          className="mt-2 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Add note
        </button>
      </div>
      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="rounded-md border border-slate-200 p-3">
            {editingId === note.id ? (
              <>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="mt-2 flex gap-2 text-sm">
                  <button onClick={() => saveEdit(note.id)} className="text-indigo-600 hover:underline">
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-slate-500 hover:underline">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="prose prose-sm prose-slate max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
                  <ReactMarkdown>{note.body}</ReactMarkdown>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                  <span>{note.createdAt.slice(0, 10)}</span>
                  <button
                    onClick={() => {
                      setEditingId(note.id);
                      setEditBody(note.body);
                    }}
                    className="hover:text-indigo-600"
                  >
                    Edit
                  </button>
                  <button onClick={() => remove(note.id)} className="hover:text-red-500">
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {notes.length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}
    </div>
  );
}
