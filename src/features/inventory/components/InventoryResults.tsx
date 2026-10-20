import Link from 'next/link'

import { StatusBadge } from '@/components/data/StatusBadge'
import { Button } from '@/components/ui/button'
import { LEGACY_NUMBER_FORMAT, numberFormatLegend, type RaffleNumberFormat } from '@/lib/ticket-number-format'
import type { StatusTone } from '@/lib/constants'
import { ticketLabel } from '@/lib/tickets'

import { AVAILABILITY_LABELS } from '../copy'
import type { SellerInventoryItem } from '../queries'
import type { InventoryAvailability } from '../rules'
import { TakeHoldButton } from './TakeHoldButton'

const TONES: Record<InventoryAvailability, StatusTone> = {
  free: 'success',
  held_by_me: 'info',
  mine: 'neutral',
  unavailable: 'neutral',
}

/**
 * Lo que encontro el buscador del catalogo interno (D-257, BR-I21).
 *
 * Cada boleta dice sus dos numeros —con la leyenda «Diario · Semanal», como en
 * todas las listas— y como esta para quien mira. Lo ajeno es «No disponible» y
 * nada mas: ni de quien es, ni si se vendio, ni si esta apartada. No es que la
 * pantalla lo calle: la base no lo manda.
 *
 * Un servidor pinta la lista; solo el boton «Apartar» es de cliente.
 */
export function InventoryResults({
  rows,
  durationMinutes,
  capReached,
  numberFormat = LEGACY_NUMBER_FORMAT,
}: {
  rows: SellerInventoryItem[]
  durationMinutes: number
  /** Con el cupo lleno no se ofrece apartar: la base lo rechazaria. */
  capReached: boolean
  /** D-261: los números de la rifa, para nombrarlos. */
  numberFormat?: RaffleNumberFormat
}) {
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((row) => {
        const numbers = ticketLabel(
          { dailyNumber: row.dailyNumber, weeklyNumber: row.weeklyNumber },
          numberFormat.groups.length,
        )
        return (
          <li
            key={`${row.dailyNumber}/${row.weeklyNumber}`}
            className="flex flex-wrap items-center justify-between gap-3 p-3"
          >
            <div className="min-w-0">
              <p className="font-mono text-base font-medium tabular-nums">{numbers}</p>
              <p className="text-muted-foreground text-xs">{numberFormatLegend(numberFormat)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={TONES[row.availability]}>
                {AVAILABILITY_LABELS[row.availability]}
              </StatusBadge>
              {row.availability === 'free' && row.ticketId ? (
                <TakeHoldButton
                  ticketId={row.ticketId}
                  dailyNumber={row.dailyNumber}
                  weeklyNumber={row.weeklyNumber}
                  numberFormat={numberFormat}
                  durationMinutes={durationMinutes}
                  disabled={capReached}
                />
              ) : null}
              {row.availability === 'mine' && row.ticketId ? (
                <Button asChild size="touch" variant="outline">
                  <Link href={`/seller/tickets/${row.ticketId}`} prefetch={false}>
                    Ver
                    <span className="sr-only"> la boleta {numbers}</span>
                  </Link>
                </Button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
