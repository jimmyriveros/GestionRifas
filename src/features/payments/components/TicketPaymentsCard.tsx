'use client'

import { useState } from 'react'
import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  PencilIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/constants'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

import type { PaymentListItem } from '../queries'
import { EditPaymentDialog, type EditPaymentTarget } from './EditPaymentDialog'
import { StatusBadge } from '@/components/data/StatusBadge'

/**
 * Abonos aplicados a UNA boleta (BR-F13).
 *
 * Recibe los pagos del cliente y se queda con la porcion que toca esta boleta.
 * Los anulados se muestran tachados: siguen en el historial, pero no cuentan en
 * el saldo (BR-F09, BR-F11).
 *
 * Una sola lista para todos los anchos. Estrecha, cada abono es una tarjeta
 * apilada —fecha y valor arriba, lo secundario debajo—; con sitio, la MISMA
 * lista se reordena en columnas alineadas con su encabezado. No hay dos arboles
 * de HTML ni una tabla encogida hasta lo ilegible.
 *
 * EL CORTE LO DECIDE EL ANCHO DE LA TARJETA, no el de la ventana (D-231). Desde
 * `xl` esta tarjeta vive en la columna derecha del detalle, que a 1.360 px mide
 * 676 px de contenido: con el corte en `lg`, a esa anchura las seis columnas se
 * apretaban aunque la ventana fuera grande. `@2xl` son 672 px de contenido, lo
 * que necesitan las tres columnas fijas, las dos flexibles y «Editar».
 */

const METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  cash: BanknoteIcon,
  transfer: ArrowLeftRightIcon,
  other: WalletIcon,
}

// El mismo reparto de columnas para el encabezado y para cada fila: si se
// cambia aqui, las dos se mueven juntas. La ultima es la accion de editar.
// Fecha, metodo y valor miden lo justo para «27 de sept de 2026»,
// «Transferencia» y «$1.200.000». Lo que sobra es para las dos de texto
// libre, y quien lo registro lleva mas peso y un minimo de 7rem: es donde cabe
// «REGISTRADO POR» en una linea, que a 682 px de contenido se partia en dos. La
// nota, si no cabe, baja de linea.
const COLUMNS = '@2xl:grid-cols-[8rem_7.5rem_6rem_minmax(7rem,1.2fr)_minmax(0,1fr)_auto]'

export function TicketPaymentsCard({
  payments,
  ticketId,
  salePrice,
  paidAmount,
  className,
}: {
  payments: PaymentListItem[]
  ticketId: string
  salePrice: number | null
  paidAmount: number
  /** Colocacion en la rejilla de quien la usa; la tarjeta no la decide. */
  className?: string
}) {
  const [editing, setEditing] = useState<EditPaymentTarget | null>(null)

  const applied = payments.flatMap((payment) => {
    const allocation = payment.allocations.find((item) => item.ticketId === ticketId)
    return allocation ? [{ payment, amount: allocation.amount }] : []
  })

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">
          <h2>Abonos de esta boleta</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="@container">
        {applied.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no tiene abonos registrados.</p>
        ) : (
          <>
            {/* Rotulos visuales de las columnas. Van marcados como decorativos
                porque cada fila lleva su propio rotulo para lectores de
                pantalla: sin eso, en escritorio se oiria un nombre suelto sin
                saber que es «quien lo registro». */}
            <div
              aria-hidden
              className={`text-muted-foreground hidden gap-4 border-b pb-2 text-xs font-medium tracking-wide uppercase @2xl:grid ${COLUMNS}`}
            >
              <span>Fecha</span>
              <span>Método de pago</span>
              <span className="text-right">Abonado</span>
              <span>Registrado por</span>
              <span>Nota</span>
              <span className="text-right">Acción</span>
            </div>

            <ul className="divide-y">
              {applied.map(({ payment, amount }) => {
                const MethodIcon = METHOD_ICONS[payment.paymentMethod]
                const maxAmount = salePrice !== null ? salePrice - (paidAmount - amount) : undefined

                return (
                  <li
                    key={payment.id}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 py-3 first:pt-3 last:pb-0 @2xl:items-center @2xl:gap-y-0 @2xl:py-3 ${COLUMNS}`}
                  >
                    <span className="col-start-1 row-start-1 text-sm whitespace-nowrap @2xl:col-start-1">
                      {formatDateEs(payment.paymentDate)}
                    </span>

                    <span className="col-start-1 row-start-2 flex items-center gap-1.5 text-sm @2xl:col-start-2 @2xl:row-start-1">
                      <MethodIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      <span className="sr-only">Método de pago: </span>
                      {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                    </span>

                    <span className="col-start-2 row-start-1 flex flex-col items-end gap-1 @2xl:col-start-3">
                      <span
                        className={
                          payment.isActive
                            ? 'text-sm font-semibold tabular-nums'
                            : 'text-muted-foreground text-sm font-semibold tabular-nums line-through'
                        }
                      >
                        {formatCOP(amount)}
                      </span>
                      {payment.isActive ? null : <StatusBadge tone="neutral">Anulado</StatusBadge>}
                    </span>

                    <span className="text-muted-foreground col-span-2 col-start-1 row-start-3 text-xs break-words @2xl:col-span-1 @2xl:col-start-4 @2xl:row-start-1">
                      <span className="@2xl:sr-only">Registrado por </span>
                      {payment.createdByName ?? 'un administrador'}
                      {payment.voidReason ? ` · Anulado: ${payment.voidReason}` : ''}
                    </span>

                    {payment.notes ? (
                      <span className="text-muted-foreground col-span-2 col-start-1 row-start-4 text-xs break-words @2xl:col-span-1 @2xl:col-start-5 @2xl:row-start-1">
                        <span className="@2xl:sr-only">Nota: </span>
                        {payment.notes}
                      </span>
                    ) : null}

                    {payment.isActive ? (
                      <span className="col-span-2 col-start-1 @2xl:col-span-1 @2xl:col-start-6 @2xl:row-start-1 @2xl:justify-self-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-11 px-3 @2xl:h-8"
                          onClick={() =>
                            setEditing({
                              paymentId: payment.id,
                              ticketId,
                              currentAmount: amount,
                              maxAmount,
                            })
                          }
                          aria-label={`Editar el abono de ${formatCOP(amount)} del ${formatDateEs(payment.paymentDate)}`}
                        >
                          <PencilIcon className="size-4" aria-hidden />
                          Editar
                        </Button>
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </CardContent>

      <EditPaymentDialog
        target={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      />
    </Card>
  )
}
