'use client'

import { useState } from 'react'
import { PencilIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import { EditSalePriceDialog, type EditSalePriceTarget } from './EditSalePriceDialog'

type TicketSalePriceProps = {
  ticketId: string
  salePrice: number
  /** Oficial congelado de esta venta. `null` en boletas anteriores a 0028. */
  basePrice: number | null
  minSalePrice: number
  paidAmount: number
  canEdit: boolean
  /** `lg` es el detalle del vendedor; `sm`, el del portal administrativo. */
  size?: 'lg' | 'sm'
}

/**
 * Precio de venta en el detalle de una boleta, con el icono para corregirlo
 * cuando la boleta ya esta asignada (D-137).
 *
 * La rebaja solo se nombra cuando la hubo: una venta al precio normal no
 * necesita que le anuncien «rebaja de $0».
 */
export function TicketSalePrice({
  ticketId,
  salePrice,
  basePrice,
  minSalePrice,
  paidAmount,
  canEdit,
  size = 'sm',
}: TicketSalePriceProps) {
  const [editing, setEditing] = useState<EditSalePriceTarget | null>(null)
  const officialPrice = basePrice ?? salePrice
  const discount = basePrice !== null && basePrice > salePrice ? basePrice - salePrice : 0

  return (
    <>
      <div className="flex min-w-0 items-center gap-1">
        <p
          className={cn(
            'min-w-0 tabular-nums',
            size === 'lg' ? 'text-lg font-semibold' : 'text-sm',
          )}
        >
          {formatCOP(salePrice)}
        </p>
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            onClick={() =>
              setEditing({
                ticketId,
                currentPrice: salePrice,
                officialPrice,
                minSalePrice,
                paidAmount,
              })
            }
            aria-label="Editar precio de venta"
            title="Editar precio de venta"
          >
            <PencilIcon className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {discount > 0 ? (
        <p className="text-muted-foreground mt-0.5 text-xs">
          {`Precio de la rifa ${formatCOP(basePrice ?? 0)} · rebaja de ${formatCOP(discount)}`}
        </p>
      ) : null}

      <EditSalePriceDialog
        target={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      />
    </>
  )
}
