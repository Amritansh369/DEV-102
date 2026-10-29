'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSession } from '@/lib/session'
import Link from 'next/link'
import { CalendarClock, Gauge, Pause, Play, Plus, Radio, RefreshCw, ShieldAlert, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ActivityFeed } from '@/components/admin/ActivityFeed'
import { ExamStatusBadge } from '@/components/admin/ExamStatusBadge'
import { KpiCard, KpiCardSkeleton } from '@/components/admin/KpiCard'
import { EmptyState, ErrorState, Skeleton } from '@/components/admin/States'
import {
  getDashboardSummary, getLiveSeries, getRecentActivity, getUpcomingExams, getViolationsByType,
  SEVERITY_COLOR, VIOLATION_META,
  type ActivityItem, type DashboardSummary, type LivePoint, type ViolationTypeStat,
} from '@/lib/api'
import { cx, formatCountdown, formatDate, formatTime, useAsyncData, useNow } from '@/lib/adminHooks'
import type { Exam, Severity } from '@/lib/types'

const SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const CARD = 'rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(10,77,166,0.12)]'

interface DashboardData {
  summary: DashboardSummary
  series: LivePoint[]
  byType: ViolationTypeStat[]
  upcoming: Exam[]
  activity: ActivityItem[]
}

async function loadDashboard(): Promise<DashboardData> {
  const [summary, series, byType, upcoming, activity] = await Promise.all([
    getDashboardSummary(), getLiveSeries(), getViolationsByType(), getUpcomingExams(), getRecentActivity(),
  ])
  return { summary, series, byType, upcoming, activity }
}

interface TipProps {
  active?: boolean
  label?: string | number
  payload?: ReadonlyArray<{ name?: string | number; value?: number | string; color?: string }>
}

function ChartTooltip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-text">{label}</p>
      {payload.map((p) => (
        <p key={String(p.name)} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          {p.name}: <span className="font-semibold text-text">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

function Card({ title, subtitle, action, className, children }: { title: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cx(CARD, className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold text-text">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function useGreeting(): string {
  const [greeting, setGreeting] = useState('Welcome back')
  useEffect(() => {
    const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()))
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening')
  }, [])
  return greeting
}

function DashboardView({ initial, onRefresh }: { initial: DashboardData; onRefresh: () => void }) {
  const [kpis, setKpis] = useState(initial.summary)
  const [series, setSeries] = useState(initial.series)
  const [byType, setByType] = useState(initial.byType)
  const [paused, setPaused] = useState(false)
  const now = useNow(30_000)
  const greeting = useGreeting()

  // Live mode: refresh the chart and KPIs from the server.
  useEffect(() => {
    if (paused) return
    const id = window.setInterval(async () => {
      try {
        const [nextSeries, nextKpis, nextTypes] = await Promise.all([getLiveSeries(), getDashboardSummary(), getViolationsByType()])
        setSeries(nextSeries)
        setKpis(nextKpis)
        setByType(nextTypes)
      } catch {
        /* keep the last good data */
      }
    }, 10_000)
    return () => window.clearInterval(id)
  }, [paused])

  const latest = series[series.length - 1]
  useEffect(() => {
    setKpis((k) => ({ ...k, candidatesOnline: { ...k.candidatesOnline, value: latest.online, series: [...k.candidatesOnline.series.slice(1), latest.online] } }))
  }, [latest])

  const handleActivity = useCallback((item: ActivityItem) => {
    if (item.kind !== 'VIOLATION' || !item.code) return
    const code = item.code
    setKpis((k) => ({ ...k, violationsToday: { ...k.violationsToday, value: k.violationsToday.value + 1 } }))
    setByType((prev) =>
      prev.some((p) => p.code === code)
        ? prev.map((p) => (p.code === code ? { ...p, count: p.count + 1 } : p))
        : [...prev, { code, label: VIOLATION_META[code].label, severity: VIOLATION_META[code].severity, count: 1 }],
    )
  }, [])

  const topTypes = useMemo(() => [...byType].sort((a, b) => b.count - a.count).slice(0, 8), [byType])
  const peak = Math.max(...series.map((p) => p.online))
  const firstName = useSession((st) => st.user?.name.split(' ')[0]) ?? 'there'
  const avgViolations = (series.reduce((s, p) => s + p.violations, 0) / series.length).toFixed(1)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-text sm:text-3xl">{greeting}, {firstName}</h1>
          <p className="mt-1 text-sm text-muted">Here&apos;s what is happening across your proctored exams right now.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onRefresh} className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none transition hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
          <Link href="/organization/exams/new" className="inline-flex items-center gap-2 rounded-xl bg-cta px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Create exam
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Live exams" value={kpis.liveExams.value} deltaPct={kpis.liveExams.deltaPct} series={kpis.liveExams.series} icon={Radio} tone="success" live />
        <KpiCard label="Candidates online" value={kpis.candidatesOnline.value} deltaPct={kpis.candidatesOnline.deltaPct} series={kpis.candidatesOnline.series} icon={Users} tone="primary" live />
        <KpiCard label="Violations today" value={kpis.violationsToday.value} deltaPct={kpis.violationsToday.deltaPct} goodWhen="down" series={kpis.violationsToday.series} icon={ShieldAlert} tone="danger" />
        <KpiCard label="Average risk score" value={kpis.avgRisk.value} suffix="/100" deltaPct={kpis.avgRisk.deltaPct} goodWhen="down" series={kpis.avgRisk.series} icon={Gauge} tone="warning" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Live proctoring load"
          subtitle="Candidates online and violations per minute, updated live"
          action={
            <button type="button" aria-pressed={paused} onClick={() => setPaused((p) => !p)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent">
              {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
              {paused ? 'Resume' : 'Pause'}
            </button>
          }
        >
          <div className="h-[280px]" role="img" aria-label={`Line chart. ${latest.online} candidates online and ${latest.violations} violations in the latest interval.`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} minTickGap={36} />
                <YAxis yAxisId="online" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} domain={['dataMin - 40', 'dataMax + 40']} />
                <YAxis yAxisId="viol" orientation="right" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, 'dataMax + 4']} />
                <Tooltip content={<ChartTooltip />} />
                <Line yAxisId="online" type="monotone" dataKey="online" name="Candidates online" stroke="#0B5BD3" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line yAxisId="viol" type="monotone" dataKey="violations" name="Violations / min" stroke="#DC2626" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3 text-xs text-muted">
            <div className="flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-primary-600" aria-hidden="true" /><dt>Candidates online</dt><dd className="font-semibold text-text">{latest.online}</dd></div>
            <div className="flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-danger" aria-hidden="true" /><dt>Violations / min</dt><dd className="font-semibold text-text">{latest.violations}</dd></div>
            <div className="flex items-center gap-2"><dt>Peak</dt><dd className="font-semibold text-text">{peak}</dd></div>
            <div className="flex items-center gap-2"><dt>Avg violations / min</dt><dd className="font-semibold text-text">{avgViolations}</dd></div>
          </dl>
        </Card>

        <Card title="Violations by type" subtitle="Top 8 today, coloured by severity">
          <div className="h-[280px]" role="img" aria-label={`Bar chart of violations by type. Most frequent: ${topTypes[0]?.label ?? 'none'} with ${topTypes[0]?.count ?? 0}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topTypes} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#F5F8FF' }} content={<ChartTooltip />} />
                <Bar dataKey="count" name="Violations" radius={[0, 6, 6, 0]} barSize={14}>
                  {topTypes.map((t) => <Cell key={t.code} fill={SEVERITY_COLOR[t.severity]} />)}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: '#64748B' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted" aria-label="Severity legend">
            {SEVERITIES.map((s) => (
              <li key={s} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEVERITY_COLOR[s] }} aria-hidden="true" />{s[0] + s.slice(1).toLowerCase()}</li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <ActivityFeed className="xl:col-span-2" initialItems={initial.activity} onNewItem={handleActivity} />

        <Card
          title="Upcoming exams"
          subtitle="Next scheduled sessions"
          action={<Link href="/organization/exams?status=SCHEDULED" className="rounded text-xs font-semibold text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent">View all</Link>}
        >
          {initial.upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Nothing scheduled" message="Schedule an exam to see it here with a live countdown." action={<Link href="/organization/exams/new" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white outline-none hover:bg-primary-600 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Create exam</Link>} />
          ) : (
            <ul className="space-y-3">
              {initial.upcoming.map((e) => (
                <li key={e.id}>
                  <Link href={`/organization/exams/${e.id}`} className="block rounded-xl border border-border p-3 outline-none transition hover:border-accent/40 hover:bg-soft focus-visible:ring-2 focus-visible:ring-accent">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-text">{e.title}</p>
                      <ExamStatusBadge status={e.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted">{formatDate(e.startsAt)} · {formatTime(e.startsAt)} · {e.durationMin} min</p>
                    <p className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-accent">{formatCountdown(e.startsAt, now)}</span>
                      <span className="text-muted">{e.candidateCount.toLocaleString('en-IN')} candidates</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="flex items-end justify-between">
        <div className="space-y-2"><Skeleton className="h-8 w-72" /><Skeleton className="h-4 w-96 max-w-full" /></div>
        <Skeleton className="h-10 w-44" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <KpiCardSkeleton key={i} />)}</div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-[380px] rounded-2xl xl:col-span-2" />
        <Skeleton className="h-[380px] rounded-2xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-[460px] rounded-2xl xl:col-span-2" />
        <Skeleton className="h-[460px] rounded-2xl" />
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const { data, error, loading, reload } = useAsyncData(loadDashboard)
  if (error && !loading) return <ErrorState title="Dashboard unavailable" message={error} onRetry={reload} />
  if (loading || !data) return <DashboardSkeleton />
  return <DashboardView initial={data} onRefresh={reload} />
}
