'use client'

import { useState } from 'react'

import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PAYMENT_METHOD_LABELS } from '@/lib/constants'
import { formatDateEs, formatDateTimeEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { ticketLabel } from '@/lib/tickets'

import type { PaymentListItem } from '../queries'
import { EditPaymentDialog, type EditPaymentTarget } from './EditPaymentDialog'

type PaymentDetailDialogProps = {
  payment: PaymentListItem | null
  onOpenChange: (open: boolean) => void
}

/**
 * Detalle de un pago con todo lo que exige BR-F13: fecha, valor, cliente,
 * boletas, vendedor, quien lo registro, metodo, notas y estado. Si esta
 * anulado, muestra ademas el motivo, la fecha y quien lo anulo (CLAUDE.md 20).
 *
 * SIN «Anular pago» desde D-198. Anular era del personal (BR-F10), y el
 * personal ya no ve la cartera de ningun vendedor: `void_payment` solo lo
 * ejecuta `service_role`. Los pagos que se anularon antes se siguen ensenando
 * tal cual, con su motivo.
 */
export function PaymentDetailDialog({ payment, onOpenChange }: PaymentDetailDialogProps) {
  const [editing, setEditing] = useState<EditPaymentTarget | null>(null)

  function close() {
    setEditing(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={payment !== null} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent className="sm:max-w-lg">
        {payment ? (
          <>
            <DialogHeader>
              <DialogTitle>{formatCOP(payment.totalAmount)}</DialogTitle>
              <DialogDescription>
                {payment.clientName} · {formatDateEs(payment.paymentDate)} ·{' '}
                {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
              </DialogDescription>
            </DialogHeader>

            {!payment.isActive ? (
              // Anulado es NEUTRAL en todo el producto —lo dice la insignia de
              // esta misma fila en la tabla—, no un error. El rosa decia lo
              // contrario a un centimetro de la insignia que decia lo correcto.
              <Notice tone="neutral">
                <span className="block font-medium">Pago anulado</span>
                <span className="mt-1 block">
                  {payment.voidedAt ? formatDateTimeEs(payment.voidedAt) : ''}
                  {payment.voidedByName ? ` · ${payment.voidedByName}` : ' · un administrador'}
                </span>
                {payment.voidReason ? (
                  <span className="mt-1 block">Motivo: {payment.voidReason}</span>
                ) : null}
                <span className="mt-2 block text-xs opacity-80">
                  Queda en el historial, pero no cuenta en los saldos.
                </span>
              </Notice>
            ) : null}

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Vendedor">{payment.sellerName ?? 'Otro vendedor'}</Field>
              <Field label="Registrado por">{payment.createdByName ?? 'Un administrador'}</Field>
              <Field label="Registrado el">{formatDateTimeEs(payment.createdAt)}</Field>
              <Field label="Estado">{payment.isActive ? 'Activo' : 'Anulado'}</Field>
              {payment.notes ? (
                <div className="col-span-2">
                  <Field label="Notas">{payment.notes}</Field>
                </div>
              ) : null}
            </dl>

            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Boletas abonadas
              </p>
              <ul className="divide-y rounded-md border">
                {payment.allocations.map((allocation) => (
                  <li
                    key={allocation.ticketId}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="font-mono tabular-nums">{ticketLabel(allocation)}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatCOP(allocation.amount)}</span>
                      {payment.isActive ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-11 px-3 lg:h-8"
                          onClick={() =>
                            setEditing({
                              paymentId: payment.id,
                              ticketId: allocation.ticketId,
                              currentAmount: allocation.amount,
                            })
                          }
                          aria-label={`Editar el abono de ${formatCOP(allocation.amount)} de la boleta ${ticketLabel(allocation)}`}
                        >
                          Editar
                        </Button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <EditPaymentDialog
              target={editing}
              onOpenChange={(open) => {
                if (!open) setEditing(null)
              }}
              onSuccess={close}
            />

            <DialogFooter>
              <Button size="touch" type="button" variant="outline" onClick={close}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
