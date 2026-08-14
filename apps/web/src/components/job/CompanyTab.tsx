"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CompanyData } from "@/lib/detail-types";

export function CompanyTab({ company }: { company: CompanyData | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: company?.name ?? "",
    website: company?.website ?? "",
    type: company?.type ?? "",
    address: company?.address ?? "",
    country: company?.country ?? "",
    notes: company?.notes ?? "",
  });
  const [saved, setSaved] = useState(false);

  if (!company) {
    return (
      <p className="text-sm text-slate-400">
        No company on this job yet — set one on the Info tab.
      </p>
    );
  }

  async function save() {
    await fetch(`/api/companies/${company!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaved(true);
    router.refresh();
  }

  const field = "w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm";

  return (
    <div className="grid max-w-lg grid-cols-1 gap-3">
      <p className="text-xs text-slate-400">
        Shared across every job at this company.
      </p>
      {(
        [
          ["name", "Name"],
          ["website", "Website"],
          ["type", "Type (public, private, …)"],
          ["address", "Address"],
          ["country", "Country"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="block text-sm">
          <span className="text-slate-600">{label}</span>
          <input
            className={field}
            value={form[key]}
            onChange={(e) => {
              setForm({ ...form, [key]: e.target.value });
              setSaved(false);
            }}
          />
        </label>
      ))}
      <label className="block text-sm">
        <span className="text-slate-600">Notes</span>
        <textarea
          className={`${field} min-h-24`}
          value={form.notes}
          onChange={(e) => {
            setForm({ ...form, notes: e.target.value });
            setSaved(false);
          }}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Save
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {form.website && (
          <a
            href={form.website.startsWith("http") ? form.website : `https://${form.website}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-indigo-600 hover:underline"
          >
            Visit website ↗
          </a>
        )}
      </div>
    </div>
  );
}
