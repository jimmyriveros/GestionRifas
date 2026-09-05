'use client'

import { PackageOpenIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { releaseTicket } from '../actions'
import { releaseTicketSchema } from '../schemas'

type ReleaseTicketDialogProps = {
  ticketId: string
  /** Los dos numeros, ya formateados: «1234 / 5678» (BR-N11). */
  ticketNumbers: string
  dailyNumber: string | null
  weeklyNumber: string | null
  /** A quien pertenece HOY la boleta. Viaja al servidor como `expectedClientId`. */
  currentClientId: string
  currentClientName: string
}

/**
 * Liberar una boleta vendida (BR-I14, D-169).
 *
 * UN dialogo para los dos portales, como `ReassignTicketClientDialog`: la regla
 * es la misma para el vendedor dueno de la boleta y para el personal, y quien la
 * aplica es `release_ticket_client`.
 *
 * Se monta sobre `ConfirmDialog` y no sobre `Dialog` a pelo porque esto es
 * exactamente lo que ese componente resuelve: una accion sensible con
 * consecuencia explicada, motivo obligatorio y dos salidas claras. No es
 * `destructive`: la boleta vuelve al inventario con sus mismos numeros y se
 * puede vender otra vez, asi que el rojo de anular sobraria (D-169).
 *
 * El motivo SOBREVIVE a un rechazo del servidor: solo se limpia al cerrar.
 */
export function ReleaseTicketDialog({
  ticketId,
  ticketNumbers,
  dailyNumber,
  weeklyNumber,
  currentClientId,
  currentClientName,
}: ReleaseTicketDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function confirm() {
    const parsed = releaseTicketSchema.safeParse({
      ticketId,
      expectedClientId: currentClientId,
      reason,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await releaseTicket(parsed.data)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(`La boleta ${ticketNumbers} quedó disponible.`)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      {/* En el telefono ocupa el ancho y mide 44 px de alto: se pulsa con el
          dedo, igual que las demas acciones de esta pantalla (D-085). El texto
          va SIEMPRE visible junto al icono. */}
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full sm:h-9 sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <PackageOpenIcon className="size-4" aria-hidden />
        Liberar boleta
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setReason('')
            setError(null)
          }
        }}
        title="Liberar boleta"
        // Lo unico que la pantalla no ensena: que el precio y la fecha de ESTA
        // venta se borran, y que lo demas no se toca.
        description={
          <>
            Dejará de estar asignada a <span className="font-medium">{currentClientName}</span> y
            volverá a quedar disponible para venderla otra vez. Se borran el precio y la fecha de
            esta venta; los números, el vendedor y la rifa no cambian.
          </>
        }
        confirmLabel="Confirmar liberación"
        pending={isPending}
        pendingLabel="Liberando..."
        confirmDisabled={reason.trim().length < 5}
        onConfirm={confirm}
      >
        <div className="space-y-4">
          {error ? (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
            >
              {error}
            </p>
          ) : null}

          {/* Que boleta y de quien, delante de los ojos: quien confirma no tiene
              por que recordarlo de memoria ni volver a la pantalla de atras. */}
          <dl className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-sm">
            <ReleaseDetail label="Número diario" value={dailyNumber ?? '—'} mono />
            <ReleaseDetail label="Número semanal" value={weeklyNumber ?? '—'} mono />
            <ReleaseDetail label="Cliente actual" value={currentClientName} />
          </dl>

          <div className="space-y-1.5">
            <Label htmlFor="release-reason">Motivo de la liberación</Label>
            <Input
              id="release-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={isPending}
              maxLength={500}
              placeholder="Ejemplo: el cliente ya no la quiere"
              aria-describedby="release-reason-hint"
            />
            <p id="release-reason-hint" className="text-muted-foreground text-xs">
              Queda guardado en el historial de la boleta.
            </p>
          </div>
        </div>
      </ConfirmDialog>
    </>
  )
}

function ReleaseDetail({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'text-right font-mono tabular-nums' : 'min-w-0 truncate text-right'}>
        {value}
      </dd>
    </div>
  )
}
