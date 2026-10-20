'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { recoverInventoryTickets } from '@/features/inventory/actions'
import { INVENTORY_COPY } from '@/features/inventory/copy'

import { useTicketSelection } from '../TicketSelectionContext'
import { BulkActionDialog } from './BulkActionDialog'

const C = INVENTORY_COPY.staff

/**
 * Recuperar boletas sin vender al inventario comun (D-257, BR-I19).
 *
 * Solo las disponibles y sin abonos en su historia: la regla es de
 * `admin_recover_inventory_tickets`, que bloquea las filas y, si una venta se
 * confirma a la vez, la ve y no recupera ninguna. Ni ventas, ni clientes, ni
 * abonos cambian.
 */
export function BulkRecoverDialog({
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
      const result = await recoverInventoryTickets({ ticketIds: selection.selectedIds })
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
      action="recover"
      title={C.recoverTitle}
      description={C.recoverDescription}
      eligibility={selection.eligibility}
      loading={selection.eligibilityLoading}
      missingCount={selection.missingCount}
      selectedCount={count}
      confirmLabel={C.recoverConfirm(count)}
      pending={isPending}
      error={error}
      onConfirm={confirm}
    />
  )
}
