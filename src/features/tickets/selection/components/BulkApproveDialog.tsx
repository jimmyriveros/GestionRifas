'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { approveTickets } from '../../actions'
import { useTicketSelection } from '../TicketSelectionContext'
import { BulkActionDialog } from './BulkActionDialog'

/**
 * Aprobar en lote las boletas que creo un vendedor (BR-I09).
 *
 * Esta accion ya existia desde la Fase 3 con su propia casilla en la tabla. Lo
 * que cambia ahora es que comparte la unica seleccion de la pantalla, en vez de
 * tener un sistema de casillas aparte: dos formas distintas de marcar boletas en
 * la misma tabla serian una trampa.
 *
 * `approve_tickets` salta por su cuenta lo que no esta pendiente, pero el boton
 * solo se habilita cuando TODAS las seleccionadas se pueden aprobar, para que el
 * resultado sea el que la persona vio antes de confirmar.
 */
export function BulkApproveDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const selection = useTicketSelection()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const count = selection.selectedCount

  function close(next: boolean) {
    onOpenChange(next)
    if (!next) setError(null)
  }

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await approveTickets({ ticketIds: selection.selectedIds })
      if ('error' in result) {
        setError(result.error)
        selection.refreshEligibility()
        return
      }
      toast.success(
        result.data.count === 1
          ? 'Se aprobó 1 boleta.'
          : `Se aprobaron ${result.data.count} boletas.`,
      )
      close(false)
      selection.clear()
      router.refresh()
    })
  }

  return (
    <BulkActionDialog
      open={open}
      onOpenChange={close}
      action="approve"
      title="Aprobar boletas"
      description="Las boletas pasarán a estado Disponible y sus vendedores ya podrán asignarlas a clientes."
      eligibility={selection.eligibility}
      loading={selection.eligibilityLoading}
      missingCount={selection.missingCount}
      selectedCount={count}
      confirmLabel={count === 1 ? 'Aprobar 1 boleta' : `Aprobar ${count} boletas`}
      pending={isPending}
      error={error}
      onConfirm={confirm}
    />
  )
}
