import Link from "next/link";
import { Board } from "@/components/Board";
import type { BoardSnapshot } from "@/lib/board-types";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

export default function Home() {
  // Round-trip through JSON so dates reach the client as ISO strings,
  // matching what /api/board returns on refresh.
  const snapshot = JSON.parse(
    JSON.stringify(getServices().boardSnapshot()),
  ) as BoardSnapshot;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-lg font-bold">{snapshot.board.name}</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="font-medium text-indigo-600">
            Board
          </Link>
          <Link href="/metrics" className="text-slate-600 hover:text-slate-900">
            Metrics
          </Link>
          <Link href="/profile" className="text-slate-600 hover:text-slate-900">
            Profile
          </Link>
          <Link href="/archived" className="text-slate-600 hover:text-slate-900">
            Archived
          </Link>
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        <Board initial={snapshot} />
      </main>
    </div>
  );
}
