'use client'

import { TicketNumberInput } from '@/components/form/TicketNumberInput'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  LEGACY_NUMBER_FORMAT,
  numberFormatSummary,
  numberGroupTitle,
  type NumberGroupSlot,
  type RaffleNumberFormat,
} from '@/lib/ticket-number-format'

/**
 * Un campo por cada número de la rifa, con su nombre y su tope de cifras
 * (D-261). Una rifa de un número pinta UN campo: nunca un segundo vacío que no
 * existe. Lo usan corregir números (los dos portales) y crear una boleta.
 *
 * No valida: quien la usa llama a `ticketNumbersProblem` con el mismo formato,
 * que dice la misma frase que la base.
 */
export function TicketNumberFields({
  format = LEGACY_NUMBER_FORMAT,
  values,
  onChange,
  idPrefix,
  disabled,
}: {
  format?: RaffleNumberFormat
  values: { daily: string; weekly: string }
  onChange: (slot: NumberGroupSlot, value: string) => void
  idPrefix: string
  disabled?: boolean
}) {
  return (
    <div className={cn('grid gap-4', format.groups.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
      {format.groups.map((group) => {
        const id = `${idPrefix}-${group.slot === 'daily_number' ? 'daily' : 'weekly'}`
        return (
          <div key={group.slot} className="space-y-1.5">
            <Label htmlFor={id}>{numberGroupTitle(group.name)}</Label>
            <TicketNumberInput
              id={id}
              value={group.slot === 'daily_number' ? values.daily : values.weekly}
              onChange={(value) => onChange(group.slot, value)}
              maxDigits={group.digits}
              disabled={disabled}
            />
          </div>
        )
      })}
    </div>
  )
}

/**
 * Lo que se dice encima de esos campos: con cuántas cifras va cada número, y
 * que los ceros de delante cuentan. Nada se rellena solo (D-261).
 */
export function ticketNumbersHelp(format: RaffleNumberFormat = LEGACY_NUMBER_FORMAT): string {
  return `Escribe cada número con todas sus cifras, con los ceros de delante: ${numberFormatSummary(format)}.`
}
