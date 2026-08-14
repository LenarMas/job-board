import Link from "next/link";
import { getServices } from "@/lib/services";

export const dynamic = "force-dynamic";

const ACCENT = "#4f46e5";

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function WeeklyBars({ data }: { data: { week: string; applications: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">No applications recorded yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.applications));
  const barWidth = 22;
  const gap = 2;
  const chartHeight = 160;
  const width = data.length * (barWidth + gap);
  const maxIdx = data.findIndex((d) => d.applications === max);
  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={chartHeight + 34}
        role="img"
        aria-label="Applications per week"
      >
        {data.map((d, i) => {
          const h = max === 0 ? 0 : Math.round((d.applications / max) * chartHeight);
          const x = i * (barWidth + gap);
          const y = chartHeight - h;
          return (
            <g key={d.week}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(h, 1)}
                rx={4}
                fill={ACCENT}
              >
                <title>{`week of ${d.week}: ${d.applications} application${d.applications === 1 ? "" : "s"}`}</title>
              </rect>
              {i === maxIdx && h > 14 && (
                <text
                  x={x + barWidth / 2}
                  y={y + 13}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#ffffff"
                >
                  {d.applications}
                </text>
              )}
              {(i === 0 || i === data.length - 1) && (
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 16}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#64748b"
                >
                  {d.week.slice(5)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={0} y1={chartHeight} x2={width} y2={chartHeight} stroke="#e2e8f0" />
      </svg>
      <details className="mt-1 text-xs text-slate-500">
        <summary className="cursor-pointer">Data table</summary>
        <table className="mt-1">
          <thead>
            <tr>
              <th className="pr-4 text-left font-medium">Week of</th>
              <th className="text-left font-medium">Applications</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.week}>
                <td className="pr-4">{d.week}</td>
                <td>{d.applications}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function StageBars({ data }: { data: { stage: string; avgDays: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">Not enough stage history yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.avgDays));
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.stage} className="flex items-center gap-3 text-sm">
          <span className="w-20 shrink-0 text-slate-600 capitalize">{d.stage}</span>
          <div className="h-4 flex-1 rounded-sm bg-slate-100">
            <div
              className="h-4 rounded-sm"
              style={{
                width: `${max === 0 ? 0 : Math.max((d.avgDays / max) * 100, 1)}%`,
                backgroundColor: ACCENT,
              }}
              title={`${d.stage}: ${d.avgDays.toFixed(1)} days average`}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-slate-500">
            {d.avgDays.toFixed(1)}d
          </span>
        </div>
      ))}
    </div>
  );
}

export default function MetricsPage() {
  const m = getServices().getMetrics();
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const totalJobs = m.totalsPerStage.reduce((n, t) => n + t.total, 0);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-lg font-bold">Metrics</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="text-slate-600 hover:text-slate-900">
            Board
          </Link>
          <Link href="/metrics" className="font-medium text-indigo-600">
            Metrics
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Pipeline
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Total jobs" value={String(totalJobs)} />
            {m.totalsPerStage.map((t) => (
              <StatTile
                key={t.stageId}
                label={t.stage[0]!.toUpperCase() + t.stage.slice(1)}
                value={String(t.total)}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Applications per week
          </h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <WeeklyBars data={m.applicationsPerWeek} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Funnel
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Applied → Interview"
              value={pct(m.conversionRates.appliedToInterview)}
            />
            <StatTile
              label="Interview → Offer"
              value={pct(m.conversionRates.interviewToOffer)}
            />
            <StatTile
              label="Applied → Offer"
              value={pct(m.conversionRates.appliedToOffer)}
            />
            <StatTile
              label="Response rate"
              value={pct(m.responseRate.rate)}
              hint={`${m.responseRate.responded} of ${m.responseRate.applied} applications`}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Average days in stage
          </h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <StageBars data={m.averageDaysInStage} />
          </div>
        </section>
      </main>
    </div>
  );
}
