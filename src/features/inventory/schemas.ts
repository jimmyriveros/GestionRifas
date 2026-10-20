import { z } from 'zod'

import { BULK_SELECTION_MAX } from '@/lib/constants'

import { INVENTORY_COPY } from './copy'
import {
  GENERATION_MAX,
  HOLD_DURATION_MAX,
  HOLD_DURATION_MIN,
  HOLD_MAX_ACTIVE_MAX,
  HOLD_MAX_ACTIVE_MIN,
  generationTotal,
  groupRangeProblem,
  paddedRanges,
} from './rules'

/**
 * Validacion del inventario comun (D-257). Capa de cliente y de servidor; la
 * tercera y definitiva son las funciones de la 0081, que vuelven a comprobarlo
 * todo con las filas bloqueadas.
 *
 * NINGUN esquema recibe organizacion, vendedor que actua ni identificador de
 * quien llama: salen de la sesion. El vendedor de destino de «Asignar a un
 * vendedor» si viaja, porque es justamente lo que el personal elige.
 */

/**
 * Un numero de un extremo de un rango, tal como se escribio: sin recortarlo. La
 * FORMA basta aqui; las cifras exactas las pone la rifa (D-261), que la accion
 * lee y valida con `generationRangesProblem`, y la base al final. Con un solo
 * número en la rifa, el segundo rango llega vacío.
 */
const rangeEnd = z.string().max(4, 'Cada número tiene como mucho 4 cifras, sin letras ni símbolos.')

const ranges = z.object({
  dailyFrom: rangeEnd,
  dailyTo: rangeEnd,
  weeklyFrom: rangeEnd,
  weeklyTo: rangeEnd,
})

/**
 * Lo que impide generar esos rangos en ESA rifa, o `null` (D-261): el rango de
 * cada número con su frase, y el tope de 100.000. Lo usan el formulario y la
 * accion; la base lo vuelve a comprobar con las mismas frases.
 */
export function generationRangesProblem(
  groups: readonly { name: string; digits: number }[],
  values: { dailyFrom: string; dailyTo: string; weeklyFrom: string; weeklyTo: string },
): { field: 'daily' | 'weekly'; message: string } | null {
  const [first, second] = groups
  const daily = groupRangeProblem(values.dailyFrom, values.dailyTo, first!)
  if (daily) return { field: 'daily', message: daily }
  if (second) {
    const weekly = groupRangeProblem(values.weeklyFrom, values.weeklyTo, second)
    if (weekly) return { field: 'weekly', message: weekly }
  }
  const total = generationTotal(paddedRanges(groups, values))
  if (total > GENERATION_MAX) {
    // La misma frase que responde la base (`admin_start_ticket_generation`).
    return { field: second ? 'weekly' : 'daily', message: INVENTORY_COPY.generator.tooMany(total, GENERATION_MAX) }
  }
  return null
}

export const generationPreviewSchema = z.object({ raffleId: z.uuid('Elige una rifa.') }).and(ranges)
export type GenerationPreviewInput = z.infer<typeof generationPreviewSchema>

export const generationStartSchema = z
  .object({
    raffleId: z.uuid('Elige una rifa.'),
    requestId: z.uuid('Falta el identificador de la solicitud. Vuelve a abrir el generador.'),
  })
  .and(ranges)
export type GenerationStartInput = z.infer<typeof generationStartSchema>

export const generationChunkSchema = z.object({
  runId: z.uuid('La generación no existe o no tienes acceso a ella.'),
  processedCount: z.number().int().min(0).max(GENERATION_MAX),
})
export type GenerationChunkInput = z.infer<typeof generationChunkSchema>

const ticketIds = z
  .array(z.uuid('Boleta no válida.'))
  .min(1, 'Selecciona al menos una boleta.')
  .max(BULK_SELECTION_MAX, `No se pueden procesar más de ${BULK_SELECTION_MAX} boletas a la vez.`)

export const assignInventorySchema = z.object({
  ticketIds,
  sellerId: z.uuid('Elige un vendedor.'),
})
export type AssignInventoryInput = z.infer<typeof assignInventorySchema>

export const recoverInventorySchema = z.object({ ticketIds })
export type RecoverInventoryInput = z.infer<typeof recoverInventorySchema>

export const holdSettingsSchema = z.object({
  raffleId: z.uuid('La rifa no existe o no tienes acceso a ella.'),
  durationMinutes: z
    .number('Escribe la duración en minutos.')
    .int('Escribe la duración en minutos enteros.')
    .min(HOLD_DURATION_MIN, 'La duración del apartado debe estar entre 5 y 180 minutos.')
    .max(HOLD_DURATION_MAX, 'La duración del apartado debe estar entre 5 y 180 minutos.'),
  maxActivePerSeller: z
    .number('Escribe el cupo por vendedor.')
    .int('El cupo se escribe en boletas enteras.')
    .min(HOLD_MAX_ACTIVE_MIN, 'El cupo por vendedor debe estar entre 0 y 100 boletas.')
    .max(HOLD_MAX_ACTIVE_MAX, 'El cupo por vendedor debe estar entre 0 y 100 boletas.'),
})
export type HoldSettingsInput = z.infer<typeof holdSettingsSchema>

export const takeHoldSchema = z.object({
  ticketId: z.uuid('La boleta no existe o no tienes acceso a ella.'),
  requestId: z.uuid('Falta el identificador de la solicitud. Vuelve a cargar la página.'),
})
export type TakeHoldInput = z.infer<typeof takeHoldSchema>

export const holdIdSchema = z.object({
  holdId: z.uuid('El apartado no existe o no es tuyo.'),
})
export type HoldIdInput = z.infer<typeof holdIdSchema>

/** Lo que el catalogo interno acepta de la URL. Un numero que no vale no busca. */
export const inventorySearchSchema = z.object({
  raffleId: z.uuid().optional(),
  daily: z
    .string()
    .regex(/^[0-9]{1,4}$/)
    .optional(),
  weekly: z
    .string()
    .regex(/^[0-9]{1,4}$/)
    .optional(),
  show: z.enum(['free', 'all']).optional(),
  page: z.coerce.number().int().min(1).optional(),
})
export type InventorySearchInput = z.infer<typeof inventorySearchSchema>
