"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JobDetailData } from "@/lib/detail-types";

export function InfoTab({ job }: { job: JobDetailData }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: job.title,
    company: job.company?.name ?? "",
    location: job.location ?? "",
    url: job.url ?? "",
    salary: job.salary ?? "",
    color: job.color ?? "#94a3b8",
    deadline: job.deadline ? job.deadline.slice(0, 10) : "",
    description: job.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  const field =
    "w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="text-slate-600">Job title</span>
        <input className={field} value={form.title} onChange={(e) => set("title", e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Company</span>
        <input className={field} value={form.company} onChange={(e) => set("company", e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Location</span>
        <input className={field} value={form.location} onChange={(e) => set("location", e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Post URL</span>
        <input className={field} value={form.url} onChange={(e) => set("url", e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Salary</span>
        <input className={field} value={form.salary} onChange={(e) => set("salary", e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Deadline</span>
        <input
          type="date"
          className={field}
          value={form.deadline}
          onChange={(e) => set("deadline", e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Color</span>
        <input
          type="color"
          className="mt-1 h-9 w-16 cursor-pointer rounded border border-slate-300"
          value={form.color}
          onChange={(e) => set("color", e.target.value)}
        />
      </label>
      <div className="text-sm text-slate-500 sm:pt-6">
        <div>Created {job.createdAt.slice(0, 10)}</div>
        {job.appliedAt && <div>Applied {job.appliedAt.slice(0, 10)}</div>}
        {job.rejectedAt && <div>Rejected {job.rejectedAt.slice(0, 10)}</div>}
      </div>
      <label className="block text-sm sm:col-span-2">
        <span className="text-slate-600">Description</span>
        <textarea
          className={`${field} min-h-40 font-mono`}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-indigo-600 hover:underline"
          >
            Open job post ↗
          </a>
        )}
      </div>
    </div>
  );
}
