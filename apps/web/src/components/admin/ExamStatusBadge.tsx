import { CalendarClock, CheckCircle2, FilePen, type LucideIcon } from 'lucide-react'
import type { Exam } from '@/lib/types'
import { cx } from '@/lib/adminHooks'

type Status = Exam['status']

export const EXAM_STATUS_META: Record<Status, { label: string; classes: string; icon: LucideIcon | null }> = {
  DRAFT: { label: 'Draft', classes: 'bg-slate-100 text-slate-600 ring-slate-200', icon: FilePen },
  SCHEDULED: { label: 'Scheduled', classes: 'bg-accent/10 text-primary-600 ring-accent/25', icon: CalendarClock },
  LIVE: { label: 'Live', classes: 'bg-success/10 text-success ring-success/25', icon: null },
  COMPLETED: { label: 'Completed', classes: 'bg-primary/10 text-primary ring-primary/20', icon: CheckCircle2 },
}

export function ExamStatusBadge({ status, className }: { status: Status; className?: string }) {
  const meta = EXAM_STATUS_META[status]
  const Icon = meta.icon
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', meta.classes, className)}>
      {Icon ? (
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
      )}
      {meta.label}
    </span>
  )
}
