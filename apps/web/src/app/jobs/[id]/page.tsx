import { notFound } from "next/navigation";
import { JobDetail } from "@/components/job/JobDetail";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const svc = getServices();
  const job = svc.getJob(Number(id));
  if (!job) notFound();
  const board = svc.getOrCreateDefaultBoard();
  const data = JSON.parse(
    JSON.stringify({
      job,
      activities: svc.listActivities(job.id),
      stageEvents: svc.listStageEvents(job.id),
      notes: svc.listNotes(job.id),
      contacts: svc.listContactsForJob(job.id),
      allContacts: svc.listContacts(),
      documents: svc.listDocuments(job.id),
      stages: svc.listStages(board.id),
    }),
  );
  return <JobDetail {...data} />;
}
