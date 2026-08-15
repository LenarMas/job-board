"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  ActivityData,
  ContactData,
  DocumentData,
  JobDetailData,
  NoteData,
  StageData,
  StageEventData,
} from "@/lib/detail-types";
import { CompanyLogo } from "../CompanyLogo";
import { ActivitiesTab } from "./ActivitiesTab";
import { CompanyTab } from "./CompanyTab";
import { ContactsTab } from "./ContactsTab";
import { DocumentsTab } from "./DocumentsTab";
import { InfoTab } from "./InfoTab";
import { NotesTab } from "./NotesTab";

const TABS = ["Info", "Activities", "Notes", "Contacts", "Documents", "Company"] as const;
type Tab = (typeof TABS)[number];

export function JobDetail({
  job,
  activities,
  stageEvents,
  notes,
  contacts,
  allContacts,
  documents,
  stages,
}: {
  job: JobDetailData;
  activities: ActivityData[];
  stageEvents: StageEventData[];
  notes: NoteData[];
  contacts: ContactData[];
  allContacts: ContactData[];
  documents: DocumentData[];
  stages: StageData[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Info");

  async function moveToStage(stageId: number) {
    await fetch(`/api/jobs/${job.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    router.refresh();
  }

  async function deleteJob() {
    if (!confirm("Delete this job and everything attached to it?")) return;
    await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  const counts: Partial<Record<Tab, number>> = {
    Activities: activities.length,
    Notes: notes.length,
    Contacts: contacts.length,
    Documents: documents.length,
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-indigo-600 hover:underline">
          ← Board
        </Link>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500" htmlFor="stage-select">
            Stage
          </label>
          <select
            id="stage-select"
            value={job.stageId}
            onChange={(e) => moveToStage(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={deleteJob}
            className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div
        className="rounded-lg border border-slate-200 bg-white shadow-sm"
        style={{ borderTopColor: job.color ?? undefined, borderTopWidth: job.color ? 4 : 1 }}
      >
        <div className="border-b border-slate-200 px-6 pt-5 pb-0">
          <h1 className="text-2xl font-bold">{job.title}</h1>
          {job.company && (
            <p className="mt-1 flex items-center gap-2 text-slate-500">
              <CompanyLogo
                name={job.company.name}
                website={job.company.website}
                size={20}
              />
              {job.company.name}
            </p>
          )}
          <nav className="mt-4 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
                  tab === t
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t}
                {counts[t] ? (
                  <span className="ml-1 text-xs text-slate-400">{counts[t]}</span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>
        <div className="p-6">
          {tab === "Info" && <InfoTab job={job} />}
          {tab === "Activities" && (
            <ActivitiesTab jobId={job.id} activities={activities} stageEvents={stageEvents} />
          )}
          {tab === "Notes" && <NotesTab jobId={job.id} notes={notes} />}
          {tab === "Contacts" && (
            <ContactsTab jobId={job.id} contacts={contacts} allContacts={allContacts} />
          )}
          {tab === "Documents" && <DocumentsTab jobId={job.id} documents={documents} />}
          {tab === "Company" && <CompanyTab company={job.company} />}
        </div>
      </div>
    </div>
  );
}
