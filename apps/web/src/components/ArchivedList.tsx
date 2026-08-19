"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

type Row = {
  id: number;
  title: string;
  companyName: string | null;
  url: string | null;
  archivedAt: string;
};

export function ArchivedList({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  async function restore(id: number) {
    await fetch(`/api/jobs/${id}/restore`, { method: "POST" });
    setRows((r) => r.filter((row) => row.id !== id));
    router.refresh();
  }

  async function hardDelete(id: number) {
    setConfirmingId(null);
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    setRows((r) => r.filter((row) => row.id !== id));
    router.refresh();
  }

  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">Nothing archived.</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <Link href={`/jobs/${row.id}`} className="font-medium text-slate-800 hover:underline">
              {row.title}
            </Link>
            <div className="truncate text-sm text-slate-500">
              {row.companyName ?? "—"} · archived {row.archivedAt.slice(0, 10)}
            </div>
          </div>
          <button
            onClick={() => restore(row.id)}
            className="rounded-md border border-indigo-200 px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            Restore
          </button>
          <button
            onClick={() => setConfirmingId(row.id)}
            className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </li>
      ))}
      <ConfirmDialog
        open={confirmingId !== null}
        title="Delete this job permanently?"
        body="This removes the job and everything attached to it. This cannot be undone."
        confirmLabel="Delete permanently"
        onConfirm={() => confirmingId !== null && hardDelete(confirmingId)}
        onCancel={() => setConfirmingId(null)}
      />
    </ul>
  );
}
