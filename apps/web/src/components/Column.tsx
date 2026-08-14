"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState } from "react";
import type { BoardJob, BoardStage } from "@/lib/board-types";
import { JobCard } from "./JobCard";

const STAGE_LABELS: Record<string, string> = {
  wishlist: "Wishlist",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export function Column({
  stage,
  jobs,
  onQuickAdd,
}: {
  stage: BoardStage;
  jobs: BoardJob[];
  onQuickAdd: (stageId: number, title: string, company: string) => Promise<void>;
}) {
  const { setNodeRef } = useDroppable({
    id: `stage-${stage.id}`,
    data: { type: "stage", stageId: stage.id },
  });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");

  async function submit() {
    if (!title.trim()) return;
    await onQuickAdd(stage.id, title.trim(), company.trim());
    setTitle("");
    setCompany("");
    setAdding(false);
  }

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-slate-100">
      <div className="flex items-baseline justify-between px-3 pt-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-700 uppercase">
          {STAGE_LABELS[stage.name] ?? stage.name}
        </h2>
        <span className="text-xs text-slate-400">{jobs.length} jobs</span>
      </div>
      <div className="px-3 pt-2">
        {adding ? (
          <div className="rounded-md border border-slate-300 bg-white p-2">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Job title"
              className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Company"
              className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={submit}
                className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
              >
                Add
              </button>
              <button
                onClick={() => setAdding(false)}
                className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-md border border-dashed border-slate-300 py-1.5 text-slate-400 hover:border-slate-400 hover:text-slate-600"
            aria-label={`Add job to ${stage.name}`}
          >
            +
          </button>
        )}
      </div>
      <SortableContext
        items={jobs.map((j) => j.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className="mt-2 flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3"
        >
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
