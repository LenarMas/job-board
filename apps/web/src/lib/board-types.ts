export type BoardJob = {
  id: number;
  title: string;
  stageId: number;
  companyId: number | null;
  companyName: string | null;
  location: string | null;
  url: string | null;
  salary: string | null;
  color: string | null;
  deadline: string | null;
  position: number;
  createdAt: string;
  appliedAt: string | null;
  rejectedAt: string | null;
  pendingActivities: number;
};

export type BoardStage = {
  id: number;
  name: string;
  position: number;
  jobs: BoardJob[];
};

export type BoardSnapshot = {
  board: { id: number; name: string };
  stages: BoardStage[];
};

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 0)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}
