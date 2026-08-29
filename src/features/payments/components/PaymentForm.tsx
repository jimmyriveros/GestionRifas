'use client'

import { AlertTriangleIcon, CheckIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { MoneyInput } from '@/components/form/MoneyInput'
import { PaymentStatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/constants'
import { todayBogota } from '@/lib/dates'
import { formatCOP } from '@/lib/money'
import { hasInternalHistory } from '@/lib/navigation-history'
import { ticketLabel } from '@/lib/tickets'
import { cn } from '@/lib/utils'

import {
  distributeAmount,
  nonZeroAllocations,
  previewPaymentStatus,
  validateAllocations,
  type Allocation,
} from '../allocation'
import { createPayment } from '../actions'
import type { PayableTicketDetail } from '../queries'
import { PaymentAllocationCards } from './PaymentAllocationCards'

/** Alto tactil de los campos en el telefono; en escritorio vuelven a 36 px. */
const TOUCH_FIELD =
  'h-12 scroll-mb-[calc(var(--bottom-nav-space)+1rem)] data-[size=default]:h-12 md:h-9 md:data-[size=default]:h-9'

type PaymentFormProps = {
  clientId: string
  clientName: string
  /** En el telefono, el formulario estira para dejar los botones al fondo (D-138). */
  className?: string
  tickets: PayableTicketDetail[]
  /**
   * A donde volver cuando el abono QUEDA GUARDADO, al cancelar o al pulsar la
   * flecha si no hay historial interno. Lo calcula la pagina a partir del
   * origen de la URL (D-135). Un error deja a la persona aqui, con lo que
   * escribio intacto, y no toca el historial.
   */
  returnTo: string
  /**
   * La boleta desde la que se llego, si se llego desde una. Solo se usa para
   * senalarla en el reparto; no cambia el destino ni la validacion.
   */
  originTicketId?: string
}

const METHODS: PaymentMethod[] = ['cash', 'transfer', 'other']

/**
 * Registro de un abono (CLAUDE.md 18).
 *
 * El reparto entre boletas se sugiere solo al escribir el total y se puede
 * ajustar fila por fila. La suma debe cuadrar EXACTAMENTE con el total
 * (BR-F05): mientras no cuadre, el boton no se habilita y se dice cuanto falta
 * o cuanto sobra.
 *
 * Ningun importe se calcula aqui de forma definitiva: `create_payment` vuelve a
 * validarlo todo dentro de una transaccion y es quien decide.
 */
export function PaymentForm({
  clientId,
  clientName,
  className,
  tickets,
  returnTo,
  originTicketId,
}: PaymentFormProps) {
  const router = useRouter()
  const [total, setTotal] = useState<number | null>(null)
  const [paymentDate, setPaymentDate] = useState(todayBogota())
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(tickets.map((ticket) => [ticket.ticketId, 0])),
  )
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const errorRef = useRef<HTMLParagraphElement>(null)

  /*
   * El aviso de error vive arriba y el boton de guardar, al final del reparto.
   * En un telefono esos dos puntos no caben juntos en la pantalla: sin esto, un
   * abono rechazado por el servidor parecia no haber hecho nada. Se lleva el
   * aviso a la vista y se le da el foco para que tambien lo anuncie el lector.
   */
  useEffect(() => {
    if (serverError === null) return
    errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    errorRef.current?.focus()
  }, [serverError])

  const totalPending = useMemo(
    () => tickets.reduce((sum, ticket) => sum + ticket.pendingAmount, 0),
    [tickets],
  )

  const allocations = useMemo<Allocation[]>(
    () =>
      tickets.map((ticket) => ({
        ticketId: ticket.ticketId,
        amount: amounts[ticket.ticketId] ?? 0,
      })),
    [tickets, amounts],
  )

  const validation = useMemo(
    () => validateAllocations(total ?? 0, allocations, tickets),
    [total, allocations, tickets],
  )

  const issueByTicket = useMemo(
    () => new Map(validation.issues.map((issue) => [issue.ticketId, issue.message])),
    [validation.issues],
  )

  /**
   * Al cambiar el total se vuelve a repartir de cero. Es lo que espera quien
   * usa la pantalla: escribe «50.000» y ve la propuesta; si quiere, la ajusta.
   */
  function handleTotalChange(value: number | null) {
    setTotal(value)
    const distributed = distributeAmount(value ?? 0, tickets, originTicketId)
    setAmounts(Object.fromEntries(distributed))
  }

  function setAmount(ticketId: string, value: number | null) {
    setAmounts((current) => ({ ...current, [ticketId]: value ?? 0 }))
  }

  function submit() {
    setServerError(null)
    startTransition(async () => {
      const result = await createPayment({
        clientId,
        totalAmount: total ?? 0,
        paymentDate,
        paymentMethod: method,
        notes,
        allocations: nonZeroAllocations(allocations),
      })

      // Un abono rechazado NO navega: la persona se queda donde esta, con el
      // total, el reparto y las notas tal como los dejo, y lee que paso.
      if ('error' in result) {
        setServerError(result.error)
        return
      }

      // Solo aqui, con el abono ya guardado, se sale de la pantalla.
      // `replace` quita el formulario del historial en TODOS los origenes
      // (D-135, extiende D-133): un `push` dejaria Origen → Formulario →
      // Origen, y el gesto de atras reabriria el formulario ya enviado.
      toast.success(`Abono de ${formatCOP(total ?? 0)} registrado.`)
      router.replace(returnTo)
      router.refresh()
    })
  }

  /**
   * Cancelar y la flecha de PageHeader hacen lo mismo: si hay historial
   * interno se usa (conserva filtros y scroll, D-089); si no —recarga,
   * pestana nueva, PWA abierta en el formulario— el origen reconstruido
   * desde la URL. No hay proteccion de cambios sin guardar en este proyecto.
   */
  function leaveWithoutSaving() {
    if (hasInternalHistory()) router.back()
    else router.push(returnTo)
  }

  return (
    <div className={cn('flex min-h-0 flex-col gap-6', className)}>
      <div className="space-y-6">
        {serverError ? (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {serverError}
          </p>
        ) : null}

        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-1.5">
            <Label htmlFor="payment-total">Valor del abono</Label>
            <MoneyInput
              id="payment-total"
              value={total}
              onChange={handleTotalChange}
              disabled={isPending}
              placeholder="$0"
              className={TOUCH_FIELD}
            />
            <p className="text-muted-foreground text-xs">
              {clientName} debe {formatCOP(totalPending)}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="payment-date">Fecha</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                disabled={isPending}
                className={TOUCH_FIELD}
              />
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="payment-method">Método</Label>
              <Select
                value={method}
                onValueChange={(value) => setMethod(value as PaymentMethod)}
                disabled={isPending}
              >
                <SelectTrigger id="payment-method" className={cn('w-full min-w-0', TOUCH_FIELD)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {PAYMENT_METHOD_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-notes">Notas (opcional)</Label>
            <Textarea
              id="payment-notes"
              rows={1}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={isPending}
              className="min-h-12 scroll-mb-[calc(var(--bottom-nav-space)+1rem)] md:min-h-16"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold">Repartir entre las boletas</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleTotalChange(total)}
              disabled={isPending || total === null}
            >
              Repartir automáticamente
            </Button>
          </div>

          {/*
          UNA fuente de datos, DOS presentaciones (D-138, el mismo criterio
          que D-107 y D-136). Lo elige Tailwind, no JavaScript: las dos se
          pintan y el navegador oculta una con `display:none` antes de que
          exista JS. `display:none` la saca del arbol de accesibilidad, asi
          que un lector encuentra una sola lista de boletas.
        */}
          <div className="md:hidden">
            <PaymentAllocationCards
              tickets={tickets}
              amounts={amounts}
              issueByTicket={issueByTicket}
              originTicketId={originTicketId}
              disabled={isPending}
              onAmountChange={setAmount}
            />
          </div>

          <div className="hidden w-full overflow-x-auto rounded-lg border md:block">
            <table className="w-full caption-bottom text-sm">
              <caption className="sr-only">Reparto del abono entre las boletas del cliente</caption>
              <thead>
                <tr className="border-b">
                  <th className="h-10 px-3 text-left font-medium">Boleta</th>
                  <th className="hidden h-10 px-3 text-right font-medium lg:table-cell">Precio</th>
                  <th className="hidden h-10 px-3 text-right font-medium lg:table-cell">Abonado</th>
                  <th className="h-10 px-3 text-right font-medium">Debe</th>
                  <th className="h-10 px-3 text-right font-medium">Abona ahora</th>
                  <th className="h-10 px-3 text-left font-medium">Quedará</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const amount = amounts[ticket.ticketId] ?? 0
                  const issue = issueByTicket.get(ticket.ticketId)
                  const isOrigin = ticket.ticketId === originTicketId
                  return (
                    <tr
                      key={ticket.ticketId}
                      className={cn('border-b', issue && 'bg-destructive/5')}
                    >
                      <td className="px-3 py-2">
                        <span className="font-mono tabular-nums">{ticketLabel(ticket)}</span>
                        {/* El dinero se sugiere primero en esta fila (D-133),
                          pero el cliente puede tener otras boletas y el
                          vendedor puede moverlo. Esto senala cual era. */}
                        {isOrigin ? (
                          <span className="text-muted-foreground mt-0.5 block text-xs">
                            La que estabas viendo
                          </span>
                        ) : null}
                      </td>
                      <td className="hidden px-3 py-2 text-right tabular-nums lg:table-cell">
                        {formatCOP(ticket.salePrice)}
                      </td>
                      <td className="hidden px-3 py-2 text-right tabular-nums lg:table-cell">
                        {formatCOP(ticket.paidAmount)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {formatCOP(ticket.pendingAmount)}
                      </td>
                      <td className="min-w-[8.5rem] px-3 py-2">
                        <MoneyInput
                          aria-label={`Valor abonado a la boleta ${ticketLabel(ticket)}`}
                          aria-invalid={Boolean(issue)}
                          value={amount === 0 ? null : amount}
                          onChange={(value) => setAmount(ticket.ticketId, value)}
                          disabled={isPending}
                          placeholder="$0"
                          className="min-w-[7.5rem]"
                        />
                        {issue ? <p className="text-destructive mt-1 text-xs">{issue}</p> : null}
                      </td>
                      <td className="px-3 py-2">
                        <PaymentStatusBadge
                          status={previewPaymentStatus(
                            ticket.salePrice,
                            ticket.paidAmount + amount,
                          )}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/*
        TELEFONO: los botones bajan al fondo de la pantalla cuando el
        formulario es corto (`mt-auto` dentro del flex de la pagina) y
        quedan debajo de las boletas cuando hay muchas. No van `fixed`:
        en un alto de 667–720 px tapaban Fecha y Notas (D-138).
      */}
      <div className="mt-auto flex flex-col gap-3">
        <div
          className={cn(
            'flex flex-col gap-1 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3',
            validation.valid
              ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
              : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950',
          )}
          aria-live="polite"
        >
          <span className="flex min-w-0 items-start gap-2 sm:items-center">
            {validation.valid ? (
              <CheckIcon className="mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden />
            ) : (
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden />
            )}
            <span className="min-w-0 text-pretty">
              {validation.error ??
                (validation.issues.length > 0
                  ? 'Corrige las boletas marcadas.'
                  : 'El reparto cuadra con el valor del abono.')}
            </span>
          </span>
          <span className="ps-6 whitespace-nowrap tabular-nums sm:ps-0">
            Repartido {formatCOP(validation.allocated)} de {formatCOP(total ?? 0)}
          </span>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:gap-2">
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || !validation.valid}
            className="h-[52px] w-full md:h-9 md:w-auto"
          >
            {isPending ? 'Registrando...' : 'Registrar abono'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={leaveWithoutSaving}
            disabled={isPending}
            className="h-[52px] w-full md:h-9 md:w-auto"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  )
}
