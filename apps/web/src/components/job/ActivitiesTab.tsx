"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActivityData, StageEventData } from "@/lib/detail-types";

const CATEGORIES = [
  { value: "apply", label: "Apply" },
  { value: "screen", label: "Screening call" },
  { value: "interview", label: "Interview" },
  { value: "hm", label: "Hiring manager" },
  { value: "technical", label: "Technical" },
  { value: "final", label: "Final round" },
  { value: "follow_up", label: "Follow up" },
  { value: "offer", label: "Offer" },
  { value: "other", label: "Other" },
] as const;

export function ActivitiesTab({
  jobId,
  activities,
  stageEvents = [],
}: {
  jobId: number;
  activities: ActivityData[];
  stageEvents?: StageEventData[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [dueAt, setDueAt] = useState("");

  async function create() {
    if (!title.trim()) return;
    await fetch(`/api/jobs/${jobId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), category, dueAt: dueAt || undefined }),
    });
    setTitle("");
    setDueAt("");
    router.refresh();
  }

  async function toggle(activity: ActivityData) {
    await fetch(`/api/activities/${activity.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !activity.completedAt }),
    });
    router.refresh();
  }

  async function remove(id: number) {
    await fetch(`/api/activities/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function removeStageEvent(id: number) {
    if (!confirm("Remove this stage change from the history? Metrics recompute without it."))
      return;
    await fetch(`/api/stage-events/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const now = Date.now();
  const pending = activities.filter((a) => !a.completedAt);
  const completed = activities.filter((a) => a.completedAt);

  function row(a: ActivityData) {
    const overdue = !a.completedAt && a.dueAt && new Date(a.dueAt).getTime() < now;
    return (
      <li
        key={a.id}
        className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
          overdue ? "border-red-200 bg-red-50" : "border-slate-200"
        }`}
      >
        <input
          type="checkbox"
          checked={!!a.completedAt}
          onChange={() => toggle(a)}
          aria-label={`Mark ${a.title} ${a.completedAt ? "incomplete" : "complete"}`}
        />
        <div className="min-w-0 flex-1">
          <span className={a.completedAt ? "text-slate-400 line-through" : ""}>{a.title}</span>
          {a.note && <p className="truncate text-xs text-slate-400">{a.note}</p>}
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          {CATEGORIES.find((c) => c.value === a.category)?.label ?? a.category}
        </span>
        {a.dueAt && (
          <span className={`text-xs ${overdue ? "font-medium text-red-600" : "text-slate-400"}`}>
            due {a.dueAt.slice(0, 10)}
          </span>
        )}
        {a.completedAt && (
          <span className="text-xs text-slate-400">done {a.completedAt.slice(0, 10)}</span>
        )}
        <button
          onClick={() => remove(a.id)}
          className="text-xs text-slate-300 hover:text-red-500"
          aria-label={`Delete ${a.title}`}
        >
          ✕
        </button>
      </li>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New activity…"
          className="min-w-48 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          aria-label="Due date"
        />
        <button
          onClick={create}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Add
        </button>
      </div>
      {pending.length > 0 && <ul className="space-y-2">{pending.map(row)}</ul>}
      {completed.length > 0 && (
        <>
          <h3 className="mt-5 mb-2 text-sm font-medium text-slate-500">Completed</h3>
          <ul className="space-y-2">{completed.map(row)}</ul>
        </>
      )}
      {activities.length === 0 && (
        <p className="text-sm text-slate-400">No activities yet.</p>
      )}

      {stageEvents.length > 0 && (
        <>
          <h3 className="mt-5 mb-2 text-sm font-medium text-slate-500">
            Stage history
          </h3>
          <ul className="space-y-1">
            {stageEvents.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-2 px-3 py-1 text-sm text-slate-500"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                {e.from ? (
                  <span>
                    Moved from <span className="font-medium capitalize">{e.from}</span> to{" "}
                    <span className="font-medium capitalize">{e.to}</span>
                  </span>
                ) : (
                  <span>
                    Added to <span className="font-medium capitalize">{e.to}</span>
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">
                  {e.movedAt.slice(0, 10)}
                </span>
                <button
                  onClick={() => removeStageEvent(e.id)}
                  className="text-xs text-slate-300 hover:text-red-500"
                  aria-label="Remove this stage change"
                  title="Remove accidental move"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
