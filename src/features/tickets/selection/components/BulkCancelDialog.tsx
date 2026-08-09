'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { bulkCancelTickets } from '../actions'
import { useTicketSelection } from '../TicketSelectionContext'
import { BulkActionDialog } from './BulkActionDialog'

/**
 * Anular varias boletas con un unico motivo (seccion 21 del encargo).
 *
 * Reutiliza exactamente las reglas de la anulacion individual: la Server Action
 * llama a `bulk_cancel_tickets`, que aplica boleta por boleta el mismo
 * `cancel_ticket_row` de siempre. Y el motivo se pide una sola vez porque una
 * autorizacion cubre el lote completo.
 */
export function BulkCancelDialog({
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
      const result = await bulkCancelTickets({ ticketIds: selection.selectedIds, reason })
      if ('error' in result) {
        setError(result.error)
        // Lo que se veia puede haber cambiado justo ahora: se vuelve a preguntar
        // para que la lista de incompatibles refleje el motivo real del rechazo.
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
      action="cancel"
      title="Anular boletas"
      description="Las boletas dejan de ser utilizables y sus combinaciones de números no podrán reutilizarse en esta rifa. Es una acción definitiva."
      eligibility={selection.eligibility}
      loading={selection.eligibilityLoading}
      missingCount={selection.missingCount}
      selectedCount={count}
      confirmLabel={count === 1 ? 'Anular 1 boleta' : `Anular ${count} boletas`}
      destructive
      pending={isPending}
      error={error}
      confirmDisabled={reason.trim().length < 5}
      onConfirm={confirm}
    >
      <div className="space-y-1.5">
        <Label htmlFor="bulk-cancel-reason">Motivo (obligatorio)</Label>
        <Textarea
          id="bulk-cancel-reason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Explica por qué se anulan estas boletas"
          disabled={isPending}
        />
        <p className="text-muted-foreground text-xs">
          Queda guardado con tu nombre y la fecha, en todas las boletas del grupo.
        </p>
      </div>
    </BulkActionDialog>
  )
}
