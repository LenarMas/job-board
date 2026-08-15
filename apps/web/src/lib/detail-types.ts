export type JobDetailData = {
  id: number;
  title: string;
  stageId: number;
  location: string | null;
  url: string | null;
  salary: string | null;
  color: string | null;
  description: string | null;
  deadline: string | null;
  createdAt: string;
  appliedAt: string | null;
  rejectedAt: string | null;
  source: "applied" | "reachout" | "referral" | "other" | null;
  company: CompanyData | null;
  stage: { id: number; name: string } | null;
};

export type StageEventData = {
  id: number;
  from: string | null;
  to: string;
  movedAt: string;
};

export type CompanyData = {
  id: number;
  name: string;
  website: string | null;
  type: string | null;
  address: string | null;
  country: string | null;
  notes: string | null;
};

export type ActivityData = {
  id: number;
  category: "apply" | "interview" | "follow_up" | "offer" | "other";
  title: string;
  note: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type NoteData = {
  id: number;
  body: string;
  createdAt: string;
};

export type ContactData = {
  id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  notes: string | null;
};

export type DocumentData = {
  id: number;
  kind: "resume" | "cover_letter" | "other";
  filename: string;
  createdAt: string;
};

export type StageData = { id: number; name: string };
