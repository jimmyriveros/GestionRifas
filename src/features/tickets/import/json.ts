import { z } from 'zod'

import { ImportParseError } from './errors'
import type { ImportRow } from './rows'

/**
 * Lectura del formato JSON, la opcion avanzada del importador.
 *
 * El formato canonico es una lista de objetos con `weekly_number` y
 * `daily_number`; se aceptan tambien los nombres en español y en camelCase
 * porque cuestan una linea y evitan un rechazo por un detalle de escritura.
 *
 * Los numeros deben venir **entre comillas** para conservar los ceros de
 * delante. Un numero JSON sin comillas se acepta igual —es un archivo valido y
 * rechazarlo seria antipatico— y se convierte a texto sin perder nada: JSON no
 * admite ceros a la izquierda en un numero (`0046` ni siquiera es JSON valido),
 * asi que no hay informacion que perder por ese lado.
 */

/** Un valor de numero de boleta: texto (lo correcto) o numero JSON. */
const rawNumber = z.union([z.string(), z.number()])

/**
 * Objeto de una boleta. Zod descarta por defecto las claves que no conoce, que
 * es justo lo que hace falta: un archivo con campos de mas no se rechaza.
 */
const ticketObjectSchema = z.object({
  weekly_number: rawNumber.optional(),
  premio_semanal: rawNumber.optional(),
  weeklyNumber: rawNumber.optional(),
  daily_number: rawNumber.optional(),
  premio_diario: rawNumber.optional(),
  dailyNumber: rawNumber.optional(),
})

const importJsonSchema = z
  .array(ticketObjectSchema, {
    error: 'El archivo JSON debe contener una lista de boletas entre corchetes.',
  })
  .min(1, 'El archivo no tiene ninguna boleta.')

type TicketObject = z.infer<typeof ticketObjectSchema>

/** Primer alias presente, ya como texto y recortado. */
function pick(object: TicketObject, keys: readonly (keyof TicketObject)[]): string {
  for (const key of keys) {
    const value = object[key]
    if (value === undefined || value === null) continue
    return String(value).trim()
  }
  return ''
}

const DAILY_KEYS = ['daily_number', 'premio_diario', 'dailyNumber'] as const
const WEEKLY_KEYS = ['weekly_number', 'premio_semanal', 'weeklyNumber'] as const

/**
 * Convierte el contenido de un archivo JSON en filas del importador.
 *
 * Se rechaza el ARCHIVO cuando no hay nada que interpretar: JSON roto, algo que
 * no es una lista, una lista vacia, o una lista en la que ningun objeto trae
 * ninguno de los campos que se esperan (es decir, no es un archivo de boletas).
 *
 * Un objeto SUELTO al que le falte un campo no tumba el archivo: llega a la
 * vista previa como fila incompleta, junto a las que si sirven. Es la misma
 * regla que con el CSV, y deja corregir un archivo de 500 boletas sin tener que
 * adivinar cual era la mala.
 */
export function parseJsonTickets(content: string): ImportRow[] {
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    throw new ImportParseError(
      'El archivo JSON está mal escrito y no se puede leer. Revisa que no falte una coma o un corchete.',
    )
  }

  const parsed = importJsonSchema.safeParse(data)
  if (!parsed.success) {
    throw new ImportParseError(
      parsed.error.issues[0]?.message ?? 'El archivo no tiene el formato que esperamos.',
    )
  }

  const rows = parsed.data.map((object, index) => ({
    rowNumber: index + 1,
    dailyNumber: pick(object, DAILY_KEYS),
    weeklyNumber: pick(object, WEEKLY_KEYS),
  }))

  if (rows.every((row) => row.dailyNumber === '' && row.weeklyNumber === '')) {
    throw new ImportParseError(
      'No encontramos los números en el archivo. Cada boleta necesita «daily_number» y «weekly_number».',
    )
  }

  return rows
}
