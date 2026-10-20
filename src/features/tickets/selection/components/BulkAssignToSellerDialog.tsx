'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { assignInventoryTickets } from '@/features/inventory/actions'
import { INVENTORY_COPY } from '@/features/inventory/copy'

import { useTicketSelection } from '../TicketSelectionContext'
import { BulkActionDialog } from './BulkActionDialog'

const C = INVENTORY_COPY.staff

/**
 * Pasar boletas del inventario comun a un vendedor (D-257, BR-I18).
 *
 * La regla vive en `admin_assign_inventory_tickets`: todo o nada, con las filas
 * bloqueadas, sin vencimiento y sin tocar el cupo de apartados. Una boleta que
 * un vendedor aparto mientras tanto hace que no se asigne ninguna, y el dialogo
 * vuelve a pedir la elegibilidad para enseñar cual estorba.
 */
export function BulkAssignToSellerDialog({
  open,
  onOpenChange,
  sellers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sellers: { id: string; fullName: string }[]
}) {
  const router = useRouter()
  const selection = useTicketSelection()
  const [sellerId, setSellerId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const count = selection.selectedCount

  function close(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setSellerId('')
      setError(null)
    }
  }

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await assignInventoryTickets({ ticketIds: selection.selectedIds, sellerId })
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
      action="assignToSeller"
      title={C.assignTitle}
      description={C.assignDescription}
      eligibility={selection.eligibility}
      loading={selection.eligibilityLoading}
      missingCount={selection.missingCount}
      selectedCount={count}
      confirmLabel={C.assignConfirm(count)}
      pending={isPending}
      error={error}
      confirmDisabled={sellerId === ''}
      onConfirm={confirm}
    >
      <div className="space-y-1.5">
        <Label htmlFor="bulk-inventory-seller">{C.assignSellerLabel}</Label>
        <Select value={sellerId} onValueChange={setSellerId} disabled={isPending}>
          <SelectTrigger id="bulk-inventory-seller" className="w-full">
            <SelectValue placeholder={C.assignSellerPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {sellers.map((seller) => (
              <SelectItem key={seller.id} value={seller.id}>
                {seller.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </BulkActionDialog>
  )
}
