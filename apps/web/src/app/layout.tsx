import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobTrack",
  description: "Self-hosted job search tracker",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions (Grammarly, LanguageTool) inject attributes into
    // <html> and <body> before React hydrates; without these React logs a
    // mismatch in dev.
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-slate-50 text-slate-900 antialiased"
      >
        {children}
      </body>
    </html>
  );
}
