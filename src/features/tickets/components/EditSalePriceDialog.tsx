'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { MoneyInput } from '@/components/form/MoneyInput'
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
import { formatCOP } from '@/lib/money'

import { updateTicketSalePrice } from '../actions'
import { checkSalePrice, type SalePriceRange } from '../sale-price'
import { updateTicketSalePriceSchema } from '../schemas'

export type EditSalePriceTarget = {
  ticketId: string
  currentPrice: number
} & SalePriceRange

type EditSalePriceDialogProps = {
  target: EditSalePriceTarget | null
  onOpenChange: (open: boolean) => void
}

/**
 * Corregir el precio de venta de una boleta asignada (BR-P13, D-137).
 *
 * Un solo dialogo para los dos portales. Aqui no se decide el saldo: se envia
 * el importe y la base lo recalcula.
 *
 * El formulario se monta de nuevo cada vez que cambia la boleta (la `key`),
 * para no sincronizar el valor con un efecto (D-085).
 */
export function EditSalePriceDialog({ target, onOpenChange }: EditSalePriceDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? null : onOpenChange(false))}>
      <DialogContent className="sm:max-w-md">
        {target ? (
          <EditSalePriceFields
            key={`${target.ticketId}:${target.currentPrice}`}
            target={target}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function EditSalePriceFields({
  target,
  onClose,
}: {
  target: EditSalePriceTarget
  onClose: () => void
}) {
  const router = useRouter()
  const [amount, setAmount] = useState<number | null>(target.currentPrice)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const range: SalePriceRange = {
    officialPrice: target.officialPrice,
    minSalePrice: target.minSalePrice,
    paidAmount: target.paidAmount,
  }
  const floor = Math.max(target.minSalePrice, target.paidAmount)

  function save() {
    const parsed = updateTicketSalePriceSchema.safeParse({
      ticketId: target.ticketId,
      salePrice: amount,
      expectedSalePrice: target.currentPrice,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.')
      return
    }

    const localError = checkSalePrice(parsed.data.salePrice, range)
    if (localError) {
      setError(localError)
      return
    }

    setError(null)

    startTransition(async () => {
      const result = await updateTicketSalePrice(parsed.data)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(`Precio de venta actualizado a ${formatCOP(parsed.data.salePrice)}.`)
      onClose()
      router.refresh()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar precio de venta</DialogTitle>
        <DialogDescription>
          Cambia el precio de venta de esta boleta. El saldo se recalcula al guardar.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Precio de venta actual
          </p>
          <p className="text-sm font-semibold tabular-nums">{formatCOP(target.currentPrice)}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-sale-price">Nuevo precio</Label>
          <MoneyInput
            id="edit-sale-price"
            value={amount}
            onChange={setAmount}
            disabled={isPending}
            aria-invalid={error !== null}
            aria-describedby={error ? 'edit-sale-price-error' : 'edit-sale-price-hint'}
          />
          <p id="edit-sale-price-hint" className="text-muted-foreground text-xs">
            {target.paidAmount > 0
              ? `Puedes poner desde ${formatCOP(floor)} hasta ${formatCOP(target.officialPrice)}. No puede ser menor que lo ya abonado.`
              : `Puedes rebajarlo hasta ${formatCOP(target.minSalePrice)}. Lo que rebajes sale de la ganancia del vendedor.`}
          </p>
        </div>

        {error ? (
          <p
            id="edit-sale-price-error"
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
          className="h-11 sm:h-9"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={save}
          disabled={isPending || amount === null || amount === target.currentPrice}
          className="h-11 sm:h-9"
        >
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </DialogFooter>
    </>
  )
}
