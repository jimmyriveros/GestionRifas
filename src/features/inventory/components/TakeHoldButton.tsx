'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { ticketLabel } from '@/lib/tickets'
import {
  LEGACY_NUMBER_FORMAT,
  numberGroupTitle,
  type RaffleNumberFormat,
} from '@/lib/ticket-number-format'

import { takeTicketHold } from '../actions'
import { INVENTORY_COPY } from '../copy'

const C = INVENTORY_COPY.seller

/**
 * «Apartar» una boleta libre del inventario comun (D-257, BR-I20).
 *
 * ANTES DE APARTAR SE VEN LOS DOS NUMEROS. Un numero diario o semanal se repite
 * en varias boletas (BR-N07), asi que la confirmacion los escribe juntos —y el
 * nombre del boton tambien— para que nadie aparte el 1234 equivocado.
 *
 * UNA SOLICITUD, UN IDENTIFICADOR. `requestId` nace con el boton y se renueva
 * solo cuando la base respondio —con exito o con un rechazo—. Si la respuesta se
 * pierde por el camino, repetir manda el MISMO identificador y la base devuelve
 * el mismo apartado, con su mismo vencimiento (BR-I25).
 */
export function TakeHoldButton({
  ticketId,
  dailyNumber,
  weeklyNumber,
  numberFormat = LEGACY_NUMBER_FORMAT,
  durationMinutes,
  disabled,
}: {
  ticketId: string
  dailyNumber: string
  weeklyNumber: string | null
  /** D-261: cuántos números tiene la boleta y cómo se llaman. */
  numberFormat?: RaffleNumberFormat
  durationMinutes: number
  disabled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [isPending, startTransition] = useTransition()
  const numbers = ticketLabel({ dailyNumber, weeklyNumber }, numberFormat.groups.length)

  function take() {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof takeTicketHold>>
      try {
        result = await takeTicketHold({ ticketId, requestId })
      } catch {
        // Sin respuesta: se conserva el identificador para que reintentar no
        // duplique nada.
        toast.error(C.takeNoAnswer)
        return
      }
      setRequestId(crypto.randomUUID())
      setOpen(false)
      if ('error' in result) {
        toast.error(result.error)
        router.refresh()
        return
      }
      if (!result.data.isActive) {
        toast.error(C.expired)
      } else if (result.data.outcome === 'already_mine') {
        toast.success(C.alreadyYours(numbers, result.data.expiresAt))
      } else {
        toast.success(C.taken(numbers, result.data.expiresAt))
      }
      router.refresh()
    })
  }

  return (
    <>
      <Button
        type="button"
        size="touch"
        onClick={() => setOpen(true)}
        disabled={disabled || isPending}
        aria-label={C.takeAria(numbers)}
      >
        {isPending ? C.taking : C.take}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={C.takeTitle(numbers)}
        description={C.takeDescription(durationMinutes)}
        confirmLabel={C.takeConfirm}
        pendingLabel={C.taking}
        pending={isPending}
        onConfirm={take}
      >
        {/* Los dos números, cada uno con su nombre: el título los junta y un
            número suelto se repite en varias boletas (BR-N07). */}
        <dl className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-sm">
          {numberFormat.groups.map((group) => (
            <div key={group.slot} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{numberGroupTitle(group.name)}</dt>
              <dd className="font-mono tabular-nums">
                {group.slot === 'daily_number' ? dailyNumber : weeklyNumber}
              </dd>
            </div>
          ))}
        </dl>
      </ConfirmDialog>
    </>
  )
}
