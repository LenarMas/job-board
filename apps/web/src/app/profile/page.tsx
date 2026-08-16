import Link from "next/link";
import { ProfileForm } from "@/components/ProfileForm";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  const { resumePath, ...profile } = getServices().getProfile();
  void resumePath;
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-lg font-bold">Profile</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="text-slate-600 hover:text-slate-900">
            Board
          </Link>
          <Link href="/metrics" className="text-slate-600 hover:text-slate-900">
            Metrics
          </Link>
          <Link href="/profile" className="font-medium text-indigo-600">
            Profile
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-2xl p-6">
        <p className="mb-4 text-sm text-slate-500">
          The browser extension uses this to autofill application forms
          (Autofill application button in the capture panel). Everything stays
          in your local database.
        </p>
        <ProfileForm initial={profile} />
      </main>
    </div>
  );
}
