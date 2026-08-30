import { Badge } from '@/components/ui/badge'
import { LOTTERY_SCHEDULE_STATUS_LABELS } from '@/features/lottery/constants'
import { cn } from '@/lib/utils'

import type { Database } from '@/types/database.types'

type ScheduleStatus = Database['public']['Enums']['lottery_schedule_status']

const BASE = 'border font-medium'

const CLASSES: Record<ScheduleStatus, string> = {
  scheduled:
    'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800',
  rescheduled_later:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  rescheduled_earlier:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  suspended:
    'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800',
  cancelled:
    'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800',
  completed:
    'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
  schedule_unverified:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  schedule_conflict:
    'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800',
}

export function LotteryScheduleBadge({ status }: { status: ScheduleStatus }) {
  return (
    <Badge variant="outline" className={cn(BASE, CLASSES[status])}>
      {LOTTERY_SCHEDULE_STATUS_LABELS[status]}
    </Badge>
  )
}
