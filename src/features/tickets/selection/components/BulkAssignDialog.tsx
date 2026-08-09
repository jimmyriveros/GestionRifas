'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ClientOption } from '@/features/clients/queries'
import { AssignTicketsForm } from '@/features/tickets/assign/components/AssignTicketsForm'
import { ticketLabel } from '@/lib/tickets'

import { allEligible, ineligibleFor, whyNot } from '../eligibility'
import { useTicketSelection } from '../TicketSelectionContext'

/**
 * Vender varias boletas al mismo cliente (secciones 29 a 33 del encargo).
 *
 * El caso real: un cliente compra seis boletas en la misma operacion. Dentro va
 * el MISMO formulario que la venta de una sola —buscar cliente, crearlo sin
 * salir, fecha— porque es la misma operacion con mas boletas.
 *
 * Si alguna de las seleccionadas ya no se puede vender, no se vende ninguna: se
 * dice cual y por que, y el boton no se habilita hasta que la persona la quite
 * de la seleccion. Vender «las que se pueda» dejaria a alguien creyendo que
 * entrego seis boletas cuando entrego cuatro (seccion 28).
 */
export function BulkAssignDialog({
  open,
  onOpenChange,
  clients,
  rafflePrices,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clients: ClientOption[]
  /** Precio vigente de cada rifa: una organizacion puede tener varias a precios
   *  distintos, asi que el total se suma boleta a boleta (seccion 30). */
  rafflePrices: Record<string, number>
}) {
  const selection = useTicketSelection()
  const rows = selection.eligibility ?? []
  const blocked = ineligibleFor(rows, 'assign')
  const ready =
    !selection.eligibilityLoading && selection.missingCount === 0 && allEligible(rows, 'assign')

  const total = rows.reduce((sum, row) => sum + (rafflePrices[row.raffleId] ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Asignar boletas</DialogTitle>
          <DialogDescription>
            Elige el cliente que compró estas boletas. El precio de cada una queda fijo con el valor
            vigente de su rifa.
          </DialogDescription>
        </DialogHeader>

        {selection.eligibilityLoading ? (
          <p className="text-muted-foreground py-2 text-sm" aria-live="polite">
            Revisando las boletas seleccionadas...
          </p>
        ) : (
          <>
            <SelectedNumbers rows={rows.filter((row) => row.can.assign)} />

            {!ready ? (
              <div
                role="alert"
                className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950"
              >
                <p className="font-medium">No se puede continuar todavía.</p>
                <ul className="space-y-1">
                  {blocked.slice(0, 5).map((row) => (
                    <li key={row.ticketId}>
                      <span className="font-mono tabular-nums">{ticketLabel(row)}</span>
                      {' — '}
                      {whyNot(row, 'assign')}
                    </li>
                  ))}
                </ul>
                {blocked.length > 5 ? <p>Y {blocked.length - 5} más.</p> : null}
                {selection.missingCount > 0 ? (
                  <p>
                    {selection.missingCount === 1
                      ? '1 boleta seleccionada ya no está disponible.'
                      : `${selection.missingCount} boletas seleccionadas ya no están disponibles.`}{' '}
                    Quítalas de la selección y vuelve a intentarlo.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {ready ? (
          <AssignTicketsForm
            ticketIds={selection.selectedIds}
            totalAmount={total}
            clients={clients}
            onDone={() => {
              onOpenChange(false)
              selection.clear()
            }}
          />
        ) : (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Volver
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Los dos numeros de cada boleta. Pocas se leen de un vistazo; muchas, con
 *  desplazamiento (seccion 31). */
function SelectedNumbers({ rows }: { rows: { ticketId: string; dailyNumber: string | null; weeklyNumber: string | null }[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">Ninguna boleta se puede asignar.</p>
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">
        {rows.length === 1 ? '1 boleta seleccionada' : `${rows.length} boletas seleccionadas`}
      </p>
      <ul className="max-h-40 overflow-y-auto rounded-md border p-2 text-sm">
        {rows.map((row) => (
          <li key={row.ticketId} className="font-mono tabular-nums">
            {ticketLabel(row)}
          </li>
        ))}
      </ul>
    </div>
  )
}
