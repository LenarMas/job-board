"use client";

import { useRef, useState } from "react";

type ProfileData = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  website: string | null;
  resumeFilename: string | null;
};

const FIELDS = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["location", "Location"],
  ["linkedin", "LinkedIn URL"],
  ["github", "GitHub URL"],
  ["website", "Website / portfolio"],
] as const;

export function ProfileForm({ initial }: { initial: ProfileData }) {
  const [form, setForm] = useState(
    Object.fromEntries(FIELDS.map(([key]) => [key, initial[key] ?? ""])) as Record<
      (typeof FIELDS)[number][0],
      string
    >,
  );
  const [resumeName, setResumeName] = useState(initial.resumeFilename);
  const [status, setStatus] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function save() {
    setStatus("Saving…");
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setStatus(res.ok ? "Saved." : "Save failed.");
  }

  async function uploadResume() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setStatus("Uploading resume…");
    const data = new FormData();
    data.set("file", file);
    const res = await fetch("/api/profile/resume", { method: "POST", body: data });
    if (res.ok) {
      const body = await res.json();
      setResumeName(body.resumeFilename);
      setStatus("Resume uploaded.");
    } else {
      setStatus("Resume upload failed.");
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  const field =
    "w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="text-slate-600">{label}</span>
            <input
              className={field}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <span className="text-sm text-slate-600">Resume</span>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {resumeName ? (
            <a
              href="/api/profile/resume"
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              {resumeName}
            </a>
          ) : (
            <span className="text-sm text-slate-400">No resume uploaded yet.</span>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="text-sm"
            aria-label="Choose resume file"
          />
          <button
            onClick={uploadResume}
            className="rounded-md border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
          >
            {resumeName ? "Replace" : "Upload"}
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Save profile
        </button>
        <span className="text-sm text-slate-500">{status}</span>
      </div>
    </div>
  );
}
