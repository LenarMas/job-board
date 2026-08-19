import Link from "next/link";
import { ArchivedList } from "@/components/ArchivedList";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

export default function ArchivedPage() {
  const rows = JSON.parse(JSON.stringify(getServices().listArchived())) as {
    id: number;
    title: string;
    companyName: string | null;
    url: string | null;
    archivedAt: string;
  }[];
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-lg font-bold">Archived</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="text-slate-600 hover:text-slate-900">
            Board
          </Link>
          <Link href="/metrics" className="text-slate-600 hover:text-slate-900">
            Metrics
          </Link>
          <Link href="/profile" className="text-slate-600 hover:text-slate-900">
            Profile
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl p-6">
        <p className="mb-4 text-sm text-slate-500">
          Archived jobs are hidden from the board, search, and metrics but keep
          all their activities and notes. Restore brings one back exactly as it
          was; Delete removes it permanently.
        </p>
        <ArchivedList initial={rows} />
      </main>
    </div>
  );
}
