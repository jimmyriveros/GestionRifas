import { Badge } from '@/components/ui/badge'
import {
  RAFFLE_STATUS_LABELS,
  TICKET_INVENTORY_STATUS_LABELS,
  TICKET_PAYMENT_STATUS_LABELS,
  type RaffleStatus,
  type TicketInventoryStatus,
  type TicketPaymentStatus,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * Badge de estado. SIEMPRE lleva texto: el color es un refuerzo, nunca la
 * unica senal (CLAUDE.md 27, docs/ARCHITECTURE.md 8.4).
 */

const BASE = 'border font-medium'

const INVENTORY_CLASSES: Record<TicketInventoryStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  pending_approval:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  available:
    'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800',
  assigned:
    'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
  cancelled:
    'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800',
}

const PAYMENT_CLASSES: Record<TicketPaymentStatus, string> = {
  unpaid: 'bg-muted text-muted-foreground border-border',
  partial:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  paid: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
}

const RAFFLE_CLASSES: Record<RaffleStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  active:
    'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
  closed:
    'bg-slate-200 text-slate-900 border-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600',
  cancelled:
    'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800',
}

export function InventoryStatusBadge({ status }: { status: TicketInventoryStatus }) {
  return (
    <Badge variant="outline" className={cn(BASE, INVENTORY_CLASSES[status])}>
      {TICKET_INVENTORY_STATUS_LABELS[status]}
    </Badge>
  )
}

export function PaymentStatusBadge({ status }: { status: TicketPaymentStatus }) {
  return (
    <Badge variant="outline" className={cn(BASE, PAYMENT_CLASSES[status])}>
      {TICKET_PAYMENT_STATUS_LABELS[status]}
    </Badge>
  )
}

export function RaffleStatusBadge({ status }: { status: RaffleStatus }) {
  return (
    <Badge variant="outline" className={cn(BASE, RAFFLE_CLASSES[status])}>
      {RAFFLE_STATUS_LABELS[status]}
    </Badge>
  )
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(BASE, isActive ? RAFFLE_CLASSES.active : RAFFLE_CLASSES.cancelled)}
    >
      {isActive ? 'Activo' : 'Inactivo'}
    </Badge>
  )
}
