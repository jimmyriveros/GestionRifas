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

import { updatePaymentAllocation } from '../actions'
import { updatePaymentAllocationSchema } from '../schemas'

export type EditPaymentTarget = {
  paymentId: string
  ticketId: string
  currentAmount: number
  /** Tope que cabe en ESTA boleta reemplazando este abono. Lo calcula quien
   *  abre el dialogo con cifras de la boleta; la RPC lo vuelve a comprobar. */
  maxAmount?: number
}

type EditPaymentDialogProps = {
  target: EditPaymentTarget | null
  onOpenChange: (open: boolean) => void
  /** Se llama tras guardar, antes de cerrar. Sirve para cerrar el detalle del
   *  pago, que si no se quedaria mostrando el importe viejo. */
  onSuccess?: () => void
}

/**
 * Corregir el valor de un abono activo (BR-F16, D-134).
 *
 * Un solo dialogo para el historial de la boleta y el detalle de un pago.
 * Aqui no se decide el saldo: se envia el importe y la base lo recalcula.
 *
 * El formulario se monta de nuevo cada vez que cambia el abono (la `key`),
 * para no sincronizar el valor con un efecto (D-085).
 */
export function EditPaymentDialog({ target, onOpenChange, onSuccess }: EditPaymentDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? null : onOpenChange(false))}>
      <DialogContent className="sm:max-w-md">
        {target ? (
          <EditPaymentFields
            key={`${target.paymentId}:${target.ticketId}:${target.currentAmount}`}
            target={target}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function EditPaymentFields({
  target,
  onClose,
  onSuccess,
}: {
  target: EditPaymentTarget
  onClose: () => void
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [amount, setAmount] = useState<number | null>(target.currentAmount)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    const parsed = updatePaymentAllocationSchema.safeParse({
      paymentId: target.paymentId,
      ticketId: target.ticketId,
      amount,
      expectedAmount: target.currentAmount,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.')
      return
    }

    if (target.maxAmount !== undefined && parsed.data.amount > target.maxAmount) {
      setError(`El valor supera el saldo pendiente (${formatCOP(target.maxAmount)}).`)
      return
    }

    setError(null)

    startTransition(async () => {
      const result = await updatePaymentAllocation(parsed.data)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(`Abono actualizado a ${formatCOP(parsed.data.amount)}.`)
      onSuccess?.()
      onClose()
      router.refresh()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar abono</DialogTitle>
        <DialogDescription>
          Cambia el valor de este abono. El saldo de la boleta se recalcula al guardar.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Valor actual
          </p>
          <p className="text-sm font-semibold tabular-nums">{formatCOP(target.currentAmount)}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-payment-amount">Nuevo valor</Label>
          <MoneyInput
            id="edit-payment-amount"
            value={amount}
            onChange={setAmount}
            disabled={isPending}
            // Con el campo vacio el boton se desactiva, y un «$0» gris ahi
            // haria creer que ya se escribio el cero, que desde D-158 es un
            // valor real. El aviso dice lo que falta hacer.
            placeholder="Escribe el valor"
            aria-invalid={error !== null}
            aria-describedby={error ? 'edit-payment-error' : undefined}
          />
          <p className="text-muted-foreground text-xs">
            {target.maxAmount !== undefined
              ? `Puedes poner como máximo ${formatCOP(target.maxAmount)}. `
              : ''}
            Con $0 el abono deja de contar en la boleta. Queda en el historial.
          </p>
        </div>

        {error ? (
          <p
            id="edit-payment-error"
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
          disabled={isPending || amount === null || amount === target.currentAmount}
          className="h-11 sm:h-9"
        >
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </DialogFooter>
    </>
  )
}
