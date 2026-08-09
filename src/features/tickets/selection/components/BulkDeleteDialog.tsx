'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { bulkDeleteTickets } from '../actions'
import { useTicketSelection } from '../TicketSelectionContext'
import { BulkActionDialog } from './BulkActionDialog'

/**
 * Eliminar boletas cargadas por error (secciones 23 a 25 del encargo).
 *
 * Eliminar NO es una forma rapida de anular, y el texto tiene que dejarlo claro
 * antes de que alguien lo descubra por las malas: anular retira de circulacion
 * una boleta que existio y conserva su historia; eliminar borra registros que
 * nunca debieron existir.
 *
 * La autorizacion es la misma que usa la aplicacion para las demas acciones
 * definitivas —ser Dueño o Administrador, confirmar y escribir un motivo— y una
 * sola cubre el lote completo. La base de datos vuelve a exigirlo todo: solo
 * borra boletas sin cliente, sin venta y sin abonos, nunca una anulada.
 */
export function BulkDeleteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const selection = useTicketSelection()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const count = selection.selectedCount

  function close(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setReason('')
      setError(null)
    }
  }

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await bulkDeleteTickets({ ticketIds: selection.selectedIds, reason })
      if ('error' in result) {
        setError(result.error)
        selection.refreshEligibility()
        return
      }
      toast.success(result.data.message)
      close(false)
      selection.clear()
      router.refresh()
    })
  }

  return (
    <BulkActionDialog
      open={open}
      onOpenChange={close}
      action="delete"
      title="Eliminar boletas"
      description="Estas boletas se borran para siempre y sus números quedan libres otra vez. Úsalo solo para corregir una carga equivocada."
      eligibility={selection.eligibility}
      loading={selection.eligibilityLoading}
      missingCount={selection.missingCount}
      selectedCount={count}
      confirmLabel={count === 1 ? 'Eliminar 1 boleta' : `Eliminar ${count} boletas`}
      destructive
      pending={isPending}
      error={error}
      confirmDisabled={reason.trim().length < 5}
      onConfirm={confirm}
    >
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Solo se pueden eliminar boletas que todavía no se vendieron ni tienen abonos. Si una
          boleta ya salió a la calle, anúlala: así conserva su historia y nadie puede reutilizar sus
          números.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-delete-reason">Motivo (obligatorio)</Label>
          <Textarea
            id="bulk-delete-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explica por qué se eliminan estas boletas"
            disabled={isPending}
          />
          <p className="text-muted-foreground text-xs">
            Aunque las boletas se borren, queda registrado quién las eliminó, cuándo, cuáles eran y
            por qué.
          </p>
        </div>
      </div>
    </BulkActionDialog>
  )
}
