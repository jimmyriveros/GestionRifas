'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TicketNumberFields, ticketNumbersHelp } from '@/features/tickets/components/TicketNumberFields'
import { ticketNumbersProblem, type RaffleNumberFormat } from '@/lib/ticket-number-format'

import { updateSellerTicketNumbers } from '../actions'
import { updateSellerTicketNumbersSchema } from '../schemas'

type SellerTicketActionsProps = {
  ticketId: string
  dailyNumber: string | null
  weeklyNumber: string | null
  /** D-261: cuantos numeros pide la boleta y con cuantas cifras. */
  numberFormat?: RaffleNumberFormat
}

/** Correccion de numeros antes de la aprobacion (matriz de permisos). */
export function SellerTicketActions({
  ticketId,
  dailyNumber,
  weeklyNumber,
  numberFormat,
}: SellerTicketActionsProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [daily, setDaily] = useState(dailyNumber ?? '')
  const [weekly, setWeekly] = useState(weeklyNumber ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    const parsed = updateSellerTicketNumbersSchema.safeParse({
      ticketId,
      dailyNumber: daily,
      weeklyNumber: weekly,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los números.')
      return
    }
    // D-261: las cifras exactas de la rifa, con la frase de la base.
    if (numberFormat) {
      const problem = ticketNumbersProblem(numberFormat, daily, weekly || null, true)
      if (problem) {
        setError(problem)
        return
      }
    }
    setError(null)

    startTransition(async () => {
      const result = await updateSellerTicketNumbers(parsed.data)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success('Números actualizados.')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Corregir números
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Corregir números</DialogTitle>
            <DialogDescription>
              Solo puedes hacerlo mientras la boleta no esté aprobada. {ticketNumbersHelp(numberFormat)}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
            >
              {error}
            </p>
          ) : null}

          <TicketNumberFields
            format={numberFormat}
            values={{ daily, weekly }}
            onChange={(slot, value) => (slot === 'daily_number' ? setDaily(value) : setWeekly(value))}
            idPrefix="seller"
          />

          <DialogFooter>
            <Button
              size="touch"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button size="touch" onClick={save} disabled={isPending}>
              {isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
