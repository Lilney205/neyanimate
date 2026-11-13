"use client";

import { useEffect, useState } from "react";
import type { getAdminAnalytics } from "@/lib/analytics";

type AnalyticsData = Awaited<ReturnType<typeof getAdminAnalytics>>;
type TrendKey = "signups" | "viewers" | "watchMinutes";
type RetentionKey = "day1" | "day7" | "day30";

function formatDate(date: string) {
  return date.slice(5);
}

function TrendChart({
  title,
  data,
  series,
}: {
  title: string;
  data: AnalyticsData["trend"];
  series: { key: TrendKey; label: string; color: string }[];
}) {
  const width = 720;
  const height = 250;
  const left = 42;
  const right = 18;
  const top = 20;
  const bottom = 32;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maximum = Math.max(1, ...data.flatMap((point) => series.map((item) => point[item.key])));
  const x = (index: number) => left + (data.length <= 1 ? chartWidth / 2 : index * chartWidth / (data.length - 1));
  const y = (value: number) => top + chartHeight - value / maximum * chartHeight;

  return (
    <section className="glass-panel min-w-0 rounded-2xl p-5" aria-label={title}>
      <h2 className="text-base font-bold">{title}</h2>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
        {series.map((item) => <span key={item.key} className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}
      </div>
      <svg className="mt-3 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} line chart`}>
        {[0, 1, 2, 3].map((line) => {
          const lineY = top + line * chartHeight / 3;
          return <g key={line}><line x1={left} x2={width - right} y1={lineY} y2={lineY} stroke="rgba(148,163,184,.18)" /><text x={left - 8} y={lineY + 4} textAnchor="end" fill="#94a3b8" fontSize="10">{Math.round(maximum * (3 - line) / 3)}</text></g>;
        })}
        {series.map((item) => <polyline key={item.key} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={data.map((point, index) => `${x(index)},${y(point[item.key])}`).join(" ")} />)}
        {data.map((point) => <title key={point.date}>{`${point.date}: ${series.map((item) => `${item.label} ${point[item.key]}`).join(", ")}`}</title>)}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1].filter((value, index, all) => all.indexOf(value) === index && value >= 0).map((index) => <text key={index} x={x(index)} y={height - 8} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"} fill="#94a3b8" fontSize="10">{formatDate(data[index].date)}</text>)}
      </svg>
    </section>
  );
}

function RetentionChart({ data }: { data: AnalyticsData["retention"] }) {
  const width = 720;
  const height = 250;
  const left = 42;
  const right = 18;
  const top = 20;
  const bottom = 32;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const x = (index: number) => left + (data.length <= 1 ? chartWidth / 2 : index * chartWidth / (data.length - 1));
  const y = (value: number) => top + chartHeight - value / 100 * chartHeight;
  const series: { key: RetentionKey; label: string; color: string }[] = [
    { key: "day1", label: "Day 1", color: "#38bdf8" },
    { key: "day7", label: "Day 7", color: "#a78bfa" },
    { key: "day30", label: "Day 30", color: "#34d399" },
  ];

  return (
    <section className="glass-panel min-w-0 rounded-2xl p-5">
      <h2 className="text-base font-bold">Viewer retention</h2>
      <p className="mt-1 text-xs text-slate-400">Share of registered viewers who played again on day 1, 7, or 30 after joining.</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
        {series.map((item) => <span key={item.key} className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}
      </div>
      <svg className="mt-3 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Retention rates by signup cohort">
        {[0, 25, 50, 75, 100].map((percent) => {
          const lineY = y(percent);
          return <g key={percent}><line x1={left} x2={width - right} y1={lineY} y2={lineY} stroke="rgba(148,163,184,.18)" /><text x={left - 8} y={lineY + 4} textAnchor="end" fill="#94a3b8" fontSize="10">{percent}%</text></g>;
        })}
        {series.map((item) => {
          const segments: string[] = [];
          let segment: string[] = [];
          data.forEach((cohort, index) => {
            const value = cohort[item.key];
            if (value === null) {
              if (segment.length) segments.push(segment.join(" "));
              segment = [];
            } else {
              segment.push(`${x(index)},${y(value)}`);
            }
          });
          if (segment.length) segments.push(segment.join(" "));
          return segments.map((points, index) => <polyline key={`${item.key}-${index}`} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />);
        })}
        {data.length > 0 && [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((value, index, all) => all.indexOf(value) === index).map((index) => <text key={index} x={x(index)} y={height - 8} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"} fill="#94a3b8" fontSize="10">{formatDate(data[index].cohort)}</text>)}
      </svg>
      <p className="mt-2 text-xs text-slate-500">Only cohorts with a complete retention window are plotted. Cohorts are daily signup groups.</p>
    </section>
  );
}

export function AnalyticsDashboard({ initialData }: { initialData: AnalyticsData }) {
  const [data, setData] = useState(initialData);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setRefreshing(true);
      try {
        const response = await fetch(`/api/studio/analytics?days=${days}`, { cache: "no-store" });
        const result = await response.json() as AnalyticsData & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Analytics refresh failed.");
        if (active) { setData(result); setError(""); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Analytics refresh failed.");
      } finally {
        if (active) setRefreshing(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [days]);

  const cards = [
    { label: "Active viewers now", value: data.summary.activeViewers.toLocaleString("en-US"), detail: "Played in the last 2 minutes" },
    { label: "Viewer accounts", value: data.summary.viewerAccounts.toLocaleString("en-US"), detail: `+${data.summary.newViewerAccounts.toLocaleString("en-US")} in ${days} days` },
    { label: "Unique viewers", value: data.summary.uniqueViewers.toLocaleString("en-US"), detail: `${data.summary.sessions.toLocaleString("en-US")} play sessions` },
    { label: "Watch time", value: `${data.summary.watchMinutes.toLocaleString("en-US")} min`, detail: `${data.summary.averageSessionMinutes} min per session` },
    { label: "Completion rate", value: `${data.summary.completionRate}%`, detail: "Sessions reaching 90% of film" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-sky-300">Platform CRM</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Audience analytics</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Live playback activity, viewer growth, retention cohorts, and recent viewer accounts.</p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="analytics-range" className="text-sm text-slate-300">Range</label>
          <select id="analytics-range" value={days} onChange={(event) => setDays(Number(event.target.value) as 7 | 30 | 90)} className="rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
          </select>
          <span className="text-xs text-slate-500">{refreshing ? "Refreshing…" : `Updated ${data.generatedAt.slice(11, 16)} UTC`}</span>
        </div>
      </div>

      {error && <p role="status" className="mt-5 rounded-xl border border-amber-300/30 bg-amber-950/30 p-3 text-sm text-amber-100">{error} Showing the last available snapshot.</p>}

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Platform key metrics">
        {cards.map((card) => <article key={card.label} className="glass-panel rounded-2xl p-5"><p className="text-xs uppercase tracking-wide text-slate-400">{card.label}</p><p className="mt-3 text-3xl font-black text-white">{card.value}</p><p className="mt-2 text-xs text-slate-400">{card.detail}</p></article>)}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <TrendChart title="Viewer growth and play sessions" data={data.trend} series={[{ key: "signups", label: "New accounts", color: "#38bdf8" }, { key: "viewers", label: "Unique viewers", color: "#a78bfa" }]} />
        <TrendChart title="Watch time by day" data={data.trend} series={[{ key: "watchMinutes", label: "Minutes watched", color: "#34d399" }]} />
        <RetentionChart data={data.retention} />
        <section className="glass-panel rounded-2xl p-5">
          <h2 className="text-base font-bold">Most watched films</h2>
          {data.topFilms.length ? <div className="mt-5 space-y-4">{data.topFilms.map((film) => {
            const maxMinutes = Math.max(1, ...data.topFilms.map((item) => item.watchMinutes));
            return <div key={film.id}><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-semibold text-slate-100">{film.title}</span><span className="text-xs text-slate-400">{film.watchMinutes} min · {film.viewers} viewers · {film.completionRate}% complete</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-400" style={{ width: `${Math.max(2, film.watchMinutes / maxMinutes * 100)}%` }} /></div></div>;
          })}</div> : <p className="mt-5 text-sm text-slate-400">No verified playback sessions in this range yet.</p>}
        </section>
      </section>

      <section className="glass-panel mt-5 overflow-hidden rounded-2xl">
        <div className="border-b border-slate-700/70 p-5"><h2 className="text-base font-bold">Recent viewer accounts</h2><p className="mt-1 text-xs text-slate-400">Administrator-only account details and associated watch activity.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-950/40 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3 font-semibold">Viewer</th><th className="px-5 py-3 font-semibold">Joined</th><th className="px-5 py-3 font-semibold">Last played</th><th className="px-5 py-3 text-right font-semibold">Watch time</th></tr></thead>
            <tbody className="divide-y divide-slate-700/50">{data.recentViewers.map((viewer) => <tr key={viewer.id}><td className="px-5 py-4"><span className="block font-semibold text-white">{viewer.name}</span><span className="text-xs text-slate-400">{viewer.email ?? "No email on account"}</span></td><td className="px-5 py-4 text-slate-300">{viewer.createdAt.slice(0, 10)}</td><td className="px-5 py-4 text-slate-300">{viewer.lastSeen ? viewer.lastSeen.slice(0, 10) : "No playback yet"}</td><td className="px-5 py-4 text-right font-semibold text-slate-100">{viewer.watchMinutes} min</td></tr>)}{!data.recentViewers.length && <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">No viewer accounts yet.</td></tr>}</tbody>
          </table>
        </div>
      </section>
      <p className="mt-4 text-xs text-slate-500">Active viewers refresh every 15 seconds. Playback time is counted from verified player play/pause events and bounded position changes.</p>
    </div>
  );
}
