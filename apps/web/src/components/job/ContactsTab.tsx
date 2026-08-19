"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ContactData } from "@/lib/detail-types";

export function ContactsTab({
  jobId,
  contacts,
  allContacts,
}: {
  jobId: number;
  contacts: ContactData[];
  allContacts: ContactData[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", title: "", email: "", phone: "", linkedin: "" });

  const linkable = allContacts.filter((c) => !contacts.some((l) => l.id === c.id));

  async function createAndLink() {
    if (!form.name.trim()) return;
    await fetch(`/api/jobs/${jobId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", title: "", email: "", phone: "", linkedin: "" });
    setCreating(false);
    router.refresh();
  }

  async function link(contactId: number) {
    await fetch(`/api/jobs/${jobId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    });
    router.refresh();
  }

  async function unlink(contactId: number) {
    await fetch(`/api/jobs/${jobId}/contacts/${contactId}`, { method: "DELETE" });
    router.refresh();
  }

  const field = "w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm";

  return (
    <div>
      <ul className="space-y-2">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {c.name}
                {c.role && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-normal text-indigo-600">
                    {c.role.replace("_", " ")}
                  </span>
                )}
              </div>
              <div className="truncate text-sm text-slate-500">
                {[c.title, c.email, c.phone].filter(Boolean).join(" · ")}
              </div>
            </div>
            {c.linkedin && (
              <a
                href={c.linkedin}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-indigo-600 hover:underline"
              >
                LinkedIn
              </a>
            )}
            <button onClick={() => unlink(c.id)} className="text-xs text-slate-400 hover:text-red-500">
              Unlink
            </button>
          </li>
        ))}
      </ul>
      {contacts.length === 0 && (
        <p className="text-sm text-slate-400">No contacts linked to this job yet.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {creating ? null : (
          <button
            onClick={() => setCreating(true)}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            New contact
          </button>
        )}
        {linkable.length > 0 && (
          <select
            defaultValue=""
            onChange={(e) => e.target.value && link(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              Link existing contact…
            </option>
            {linkable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {creating && (
        <div className="mt-3 grid max-w-md grid-cols-1 gap-2">
          <input className={field} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={field} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={field} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className={field} placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className={field} placeholder="LinkedIn URL" value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />
          <div className="flex gap-2">
            <button onClick={createAndLink} className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              Create & link
            </button>
            <button onClick={() => setCreating(false)} className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
