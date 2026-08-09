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

import { bulkChangeTicketSeller } from '../actions'
import { useTicketSelection } from '../TicketSelectionContext'
import { BulkActionDialog } from './BulkActionDialog'

/**
 * Pasar varias boletas a otro vendedor (seccion 22 del encargo).
 *
 * Sin reglas nuevas: la Server Action llama a `bulk_change_ticket_seller`, la
 * misma funcion que usa el cambio de una sola boleta. Ni asignadas ni anuladas,
 * y el destino tiene que ser un vendedor activo de la organizacion.
 */
export function BulkChangeSellerDialog({
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
      const result = await bulkChangeTicketSeller({ ticketIds: selection.selectedIds, sellerId })
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
      action="changeSeller"
      title="Cambiar vendedor"
      description="Estas boletas pasarán al vendedor que elijas y dejarán de estar disponibles para el actual."
      eligibility={selection.eligibility}
      loading={selection.eligibilityLoading}
      missingCount={selection.missingCount}
      selectedCount={count}
      confirmLabel={count === 1 ? 'Cambiar 1 boleta' : `Cambiar ${count} boletas`}
      pending={isPending}
      error={error}
      confirmDisabled={sellerId === ''}
      onConfirm={confirm}
    >
      <div className="space-y-1.5">
        <Label htmlFor="bulk-seller">Nuevo vendedor</Label>
        <Select value={sellerId} onValueChange={setSellerId} disabled={isPending}>
          <SelectTrigger id="bulk-seller" className="w-full">
            <SelectValue placeholder="Elige un vendedor" />
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
