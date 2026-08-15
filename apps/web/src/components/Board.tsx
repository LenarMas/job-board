"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useMemo, useState } from "react";
import type { BoardJob, BoardSnapshot } from "@/lib/board-types";
import { Column } from "./Column";
import { JobCard } from "./JobCard";

export function Board({ initial }: { initial: BoardSnapshot }) {
  const [stages, setStages] = useState(initial.stages);
  const [filter, setFilter] = useState("");
  const [activeJob, setActiveJob] = useState<BoardJob | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = useCallback(async () => {
    const res = await fetch("/api/board");
    if (res.ok) setStages((await res.json()).stages);
  }, []);

  function findJob(id: number): { job: BoardJob; stageIdx: number; jobIdx: number } | null {
    for (let s = 0; s < stages.length; s++) {
      const stage = stages[s];
      if (!stage) continue;
      const jobIdx = stage.jobs.findIndex((j) => j.id === id);
      const job = stage.jobs[jobIdx];
      if (jobIdx !== -1 && job) return { job, stageIdx: s, jobIdx };
    }
    return null;
  }

  /** Resolve a droppable/sortable id to its stage id. */
  function stageIdOf(overId: string | number): number | null {
    if (typeof overId === "string" && overId.startsWith("stage-")) {
      return Number(overId.slice("stage-".length));
    }
    const found = findJob(Number(overId));
    return found ? found.job.stageId : null;
  }

  function handleDragStart(event: DragStartEvent) {
    const found = findJob(Number(event.active.id));
    setActiveJob(found?.job ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = Number(active.id);
    const targetStageId = stageIdOf(over.id);
    const found = findJob(activeId);
    if (!found || targetStageId === null || found.job.stageId === targetStageId) return;
    // Move the card into the target column optimistically while dragging.
    setStages((prev) =>
      prev.map((stage) => {
        if (stage.id === found.job.stageId) {
          return { ...stage, jobs: stage.jobs.filter((j) => j.id !== activeId) };
        }
        if (stage.id === targetStageId) {
          return {
            ...stage,
            jobs: [...stage.jobs, { ...found.job, stageId: targetStageId }],
          };
        }
        return stage;
      }),
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveJob(null);
    if (!over) return refresh();
    const activeId = Number(active.id);
    const found = findJob(activeId);
    const targetStageId = stageIdOf(over.id);
    if (!found || targetStageId === null) return refresh();

    // Work out the target index within the destination column.
    const destStage = stages.find((s) => s.id === targetStageId);
    if (!destStage) return refresh();
    let index: number;
    const overJobId = Number(over.id);
    const overIdx = destStage.jobs.findIndex((j) => j.id === overJobId);
    if (overIdx === -1) {
      index = destStage.jobs.length;
    } else {
      index = overIdx;
    }

    // Optimistic reorder in place.
    setStages((prev) =>
      prev.map((stage) => {
        if (stage.id !== targetStageId) return stage;
        const withoutActive = stage.jobs.filter((j) => j.id !== activeId);
        const clamped = Math.min(index, withoutActive.length);
        return {
          ...stage,
          jobs: [
            ...withoutActive.slice(0, clamped),
            { ...found.job, stageId: targetStageId },
            ...withoutActive.slice(clamped),
          ],
        };
      }),
    );

    const res = await fetch(`/api/jobs/${activeId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId: targetStageId, index }),
    });
    if (!res.ok) await refresh();
  }

  async function handleQuickAdd(stageId: number, title: string, company: string) {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, company, stageId }),
    });
    if (res.ok) await refresh();
  }

  const visibleStages = useMemo(() => {
    if (!filter.trim()) return stages;
    const q = filter.trim().toLowerCase();
    return stages.map((stage) => ({
      ...stage,
      jobs: stage.jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          (j.companyName ?? "").toLowerCase().includes(q) ||
          (j.location ?? "").toLowerCase().includes(q),
      ),
    }));
  }, [stages, filter]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 px-4 py-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title, company, location…"
          className="w-72 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          aria-label="Filter jobs"
        />
        {filter && (
          <span className="text-sm text-slate-500">
            {visibleStages.reduce((n, s) => n + s.jobs.length, 0)} matching
          </span>
        )}
      </div>
      <DndContext
        id="board-dnd"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto px-4 pb-4">
          {visibleStages.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              jobs={stage.jobs}
              onQuickAdd={handleQuickAdd}
            />
          ))}
        </div>
        <DragOverlay>{activeJob ? <JobCard job={activeJob} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
