'use client'

import { PlusIcon } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/data/EmptyState'
import { StatusBadge } from '@/components/data/StatusBadge'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'
import type { PaymentAccount } from '@/features/payment-accounts/accounts'
import {
  PAYMENT_REMINDER_STATUS_LABELS,
  PAYMENT_REMINDER_STATUS_TONES,
} from '@/lib/constants'

import { setPaymentReminderStatus } from '../actions'
import {
  countActive,
  PAYMENT_REMINDER_MAX,
  REMINDER_COPY,
  reminderSchedule,
  sortReminders,
  type PaymentReminder,
} from '../reminders'
import { PaymentReminderDialog } from './PaymentReminderDialog'

/**
 * «Recordatorios de pago» (BR-S01..BR-S06, D-188).
 *
 * Los recordatorios llegan del servidor y esta pantalla NO los vuelve a
 * consultar: lo que cambia lo refresca `revalidatePath`. Sin estado global, sin
 * sondeo y sin Realtime (D-185).
 *
 * PAUSAR NO ES ARCHIVAR, y por eso son dos acciones con dos verbos y solo una
 * pide confirmacion: pausar se deshace de un toque —y el boton del pausado dice
 * «Reanudar»—, mientras que archivar lo saca del listado.
 *
 * NO SE ENSEÑA NINGUNA FECHA DE PROXIMO ENVIO. La base ya calcula `next_run_at`,
 * pero en esta etapa **no hay motor**: escribir «suena el martes 15» seria
 * prometer algo que todavia no ocurre (D-116).
 */
export function PaymentRemindersSection({
  reminders,
  accounts,
}: {
  reminders: PaymentReminder[]
  accounts: PaymentAccount[]
}) {
  const visible = sortReminders(reminders.filter((reminder) => reminder.status !== 'archived'))
  const archived = sortReminders(reminders.filter((reminder) => reminder.status === 'archived'))
  const isFull = countActive(reminders) >= PAYMENT_REMINDER_MAX

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PaymentReminder | undefined>(undefined)
  const [archiving, setArchiving] = useState<PaymentReminder | null>(null)
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function openEdit(reminder: PaymentReminder) {
    setEditing(reminder)
    setDialogOpen(true)
  }

  function setStatus(reminder: PaymentReminder, status: 'active' | 'paused' | 'archived') {
    startTransition(async () => {
      const result = await setPaymentReminderStatus({ reminderId: reminder.id, status })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      if (status === 'archived') setArchiving(null)
      toast.success(
        status === 'archived'
          ? REMINDER_COPY.archived
          : status === 'paused'
            ? REMINDER_COPY.paused
            : REMINDER_COPY.resumed,
      )
    })
  }

  return (
    <div className="space-y-6">
      {visible.length === 0 ? (
        <EmptyState
          title={REMINDER_COPY.empty.title}
          description={REMINDER_COPY.empty.description}
          action={
            <Button size="touch" onClick={openCreate}>
              <PlusIcon className="size-4" aria-hidden />
              {REMINDER_COPY.add}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <ul className="space-y-3">
            {visible.map((reminder) => (
              <li
                key={reminder.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-body-medium">{reminderSchedule(reminder)}</p>
                  <StatusBadge tone={PAYMENT_REMINDER_STATUS_TONES[reminder.status]}>
                    {PAYMENT_REMINDER_STATUS_LABELS[reminder.status]}
                  </StatusBadge>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={() => openEdit(reminder)}
                    disabled={isPending}
                  >
                    {REMINDER_COPY.edit}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    onClick={() =>
                      setStatus(reminder, reminder.status === 'active' ? 'paused' : 'active')
                    }
                    disabled={isPending || (reminder.status !== 'active' && isFull)}
                  >
                    {reminder.status === 'active' ? REMINDER_COPY.pause : REMINDER_COPY.resume}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    onClick={() => setArchiving(reminder)}
                    disabled={isPending}
                  >
                    {REMINDER_COPY.archive}
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <Button size="touch" onClick={openCreate} disabled={isFull || isPending}>
              <PlusIcon className="size-4" aria-hidden />
              {REMINDER_COPY.add}
            </Button>
            {/* El tope se dice cuando estorba, no antes (D-188). */}
            {isFull ? (
              <p className="text-body-small text-muted-foreground">{REMINDER_COPY.addBlocked}</p>
            ) : null}
          </div>
        </div>
      )}

      {archived.length > 0 ? (
        <section className="space-y-3 border-t pt-6">
          <h3 className="text-heading-h5">{REMINDER_COPY.archivedTitle}</h3>
          <ul className="space-y-2">
            {archived.map((reminder) => (
              <li
                key={reminder.id}
                className="text-body-small text-muted-foreground rounded-lg border border-dashed p-3"
              >
                {reminderSchedule(reminder)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PaymentReminderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        reminder={editing}
        accounts={accounts}
      />

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null)
        }}
        title={REMINDER_COPY.archiveConfirm.title}
        description={REMINDER_COPY.archiveConfirm.description}
        confirmLabel={REMINDER_COPY.archiveConfirm.confirm}
        pendingLabel={REMINDER_COPY.archiveConfirm.pending}
        pending={isPending}
        onConfirm={() => {
          if (archiving) setStatus(archiving, 'archived')
        }}
      />
    </div>
  )
}
