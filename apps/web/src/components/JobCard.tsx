"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { memo } from "react";
import { timeAgo, type BoardJob } from "@/lib/board-types";

export const JobCard = memo(function JobCard({ job }: { job: BoardJob }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: job.id, data: { type: "job", stageId: job.stageId } });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        borderLeftColor: job.color ?? "#cbd5e1",
      }}
      className={`rounded-md border border-l-4 border-slate-200 bg-white p-3 shadow-sm ${
        isDragging ? "opacity-40" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <Link
        href={`/jobs/${job.id}`}
        className="block font-medium text-slate-900 hover:underline"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      >
        {job.title}
      </Link>
      {job.companyName && (
        <div className="mt-0.5 truncate text-sm text-slate-500">{job.companyName}</div>
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
