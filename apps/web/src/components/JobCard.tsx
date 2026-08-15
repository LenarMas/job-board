"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { memo } from "react";
import { timeAgo, type BoardJob } from "@/lib/board-types";
import { CompanyLogo } from "./CompanyLogo";

export const JobCard = memo(function JobCard({
  job,
  onDelete,
}: {
  job: BoardJob;
  onDelete?: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: job.id, data: { type: "job", stageId: job.stageId } });

  // The whole card is a drag handle, so the quick actions must stop pointer
  // events from reaching dnd-kit's sensors.
  const shield = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        borderLeftColor: job.color ?? "#cbd5e1",
      }}
      className={`group relative rounded-md border border-l-[3px] border-[#190445]/15 bg-white p-3 shadow-[0_1px_3px_rgba(25,4,69,0.06)] ${
        isDragging ? "opacity-40" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onDelete && (
          <button
            {...shield}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete "${job.title}"?`)) onDelete(job.id);
            }}
            className="rounded border border-slate-200 bg-white p-1 text-slate-400 shadow-sm hover:border-red-200 hover:text-red-500"
            aria-label={`Delete ${job.title}`}
            title="Delete"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2.5 4h11M6.5 4V2.5h3V4m-6 0 .5 9.5h8L12.5 4M6.5 7v4M9.5 7v4" />
            </svg>
          </button>
        )}
        {job.url && (
          <a
            {...shield}
            href={job.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded border border-slate-200 bg-white p-1 text-slate-400 shadow-sm hover:border-indigo-200 hover:text-indigo-600"
            aria-label={`Open job post for ${job.title}`}
            title="Open job post"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6.5 3.5h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3M9.5 2.5h4v4M13 3 7.5 8.5" />
            </svg>
          </a>
        )}
      </div>

      <Link
        href={`/jobs/${job.id}`}
        className="block pr-6 text-sm font-semibold text-[#190445] hover:underline"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      >
        {job.title}
      </Link>
      {job.companyName && (
        <div className="mt-1 flex items-center gap-1.5 text-sm text-[#190445]/70">
          <CompanyLogo name={job.companyName} website={job.companyWebsite} size={16} />
          <span className="truncate">{job.companyName}</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>{timeAgo(job.createdAt)}</span>
        {job.pendingActivities > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
            {job.pendingActivities} due
          </span>
        )}
      </div>
    </div>
  );
});
