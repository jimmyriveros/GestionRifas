'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { TicketNumberInput } from '@/components/form/TicketNumberInput'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

import { updateSellerTicketNumbers } from '../actions'
import { updateSellerTicketNumbersSchema } from '../schemas'

type SellerTicketActionsProps = {
  ticketId: string
  dailyNumber: string | null
  weeklyNumber: string | null
}

/** Correccion de numeros antes de la aprobacion (matriz de permisos). */
export function SellerTicketActions({
  ticketId,
  dailyNumber,
  weeklyNumber,
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
      setError(parsed.error.issues[0]?.message ?? 'Revisa los numeros.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await updateSellerTicketNumbers(parsed.data)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success('Numeros actualizados.')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Corregir numeros
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Corregir numeros</DialogTitle>
            <DialogDescription>
              Solo puedes hacerlo mientras la boleta no este aprobada. Los ceros iniciales importan:
              007 no es lo mismo que 7.
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="seller-daily">Numero diario</Label>
              <TicketNumberInput id="seller-daily" value={daily} onChange={setDaily} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seller-weekly">Numero semanal</Label>
              <TicketNumberInput id="seller-weekly" value={weekly} onChange={setWeekly} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={isPending}>
              {isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
