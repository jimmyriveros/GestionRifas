import 'server-only'

import { cache } from 'react'

import { fetchAllRows } from '@/lib/supabase/paginate'
import { createClient } from '@/lib/supabase/server'
import {
  numberFormatFromRow,
  RAFFLE_NUMBER_FORMAT_COLUMNS,
  type RaffleNumberFormat,
  type RaffleNumberFormatRow,
  type RaffleNumberFormats,
} from '@/lib/ticket-number-format'

/**
 * El formato de numeros de CADA rifa de la organizacion, por su id (D-261).
 *
 * Lo usan las lecturas que pintan boletas de varias rifas —«Mis boletas»,
 * «Boletas», premios, cierre, inventario—: cada boleta se pinta con la
 * estructura de SU rifa. Pocas filas y ningun dato de cartera; la politica
 * `raffles_select` deja leerlas a todo miembro de la organizacion. `cache` la
 * comparte dentro de una peticion. Vive sola para que la puedan importar las
 * lecturas de boletas sin un ciclo con `raffles/queries.ts`.
 */
export const listRaffleNumberFormats = cache(async (): Promise<RaffleNumberFormats> => {
  const supabase = await createClient()
  const { rows } = await fetchAllRows<RaffleNumberFormatRow & { id: string }>((from, to) =>
    supabase
      .from('raffles')
      .select(`id, ${RAFFLE_NUMBER_FORMAT_COLUMNS}`)
      .order('id', { ascending: true })
      .range(from, to),
  )
  return new Map(rows.map((row) => [row.id, numberFormatFromRow(row)]))
})

/** Pega a cada fila el formato de su rifa. */
export function withNumberFormat<T extends { raffleId: string }>(
  rows: T[],
  formats: RaffleNumberFormats,
): Array<T & { numberFormat?: RaffleNumberFormat }> {
  return rows.map((row) => ({ ...row, numberFormat: formats.get(row.raffleId) }))
}
