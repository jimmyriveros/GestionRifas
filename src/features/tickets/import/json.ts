import { z } from 'zod'

import { matchJsonKey, type TicketColumn } from './columns'
import { ImportParseError } from './errors'
import type { ImportRow } from './rows'

/**
 * Lectura del formato JSON, la opcion avanzada del importador.
 *
 * Las claves se reconocen con la MISMA tabla de alias que los encabezados del
 * CSV (`matchJsonKey`), asi que los tres estilos que la gente escribe valen sin
 * mantener dos listas: `daily_number`, `dailyNumber` y «Premio diario» son la
 * misma columna. Antes vivia aqui una segunda lista de alias; se retiro al
 * anadir «Abono» para no tener que ampliarla en dos sitios cada vez (BR-N14).
 *
 * Los numeros deben venir **entre comillas** para conservar los ceros de
 * delante. Un numero JSON sin comillas se acepta igual —es un archivo valido y
 * rechazarlo seria antipatico— y se convierte a texto sin perder nada: JSON no
 * admite ceros a la izquierda en un numero (`0046` ni siquiera es JSON valido),
 * asi que no hay informacion que perder por ese lado.
 */

/**
 * Una lista de objetos. Las claves que no se reconocen se ignoran, igual que
 * las columnas de mas de un CSV: un archivo con campos sobrantes no se rechaza.
 */
const importJsonSchema = z
  .array(z.record(z.string(), z.unknown()), {
    error: 'El archivo JSON debe contener una lista de boletas entre corchetes.',
  })
  .min(1, 'El archivo no tiene ninguna boleta.')

type JsonObject = Record<string, unknown>

/**
 * Que columna trae cada objeto y con que texto.
 *
 * Se queda con la PRIMERA clave que reconoce de cada tipo, igual que
 * `detectMapping` con los encabezados: un objeto que traiga `cliente` y
 * `client_name` no se pisa a si mismo.
 *
 * Un valor que no sea texto ni numero —un objeto, una lista, un booleano— se
 * trata como si la clave no estuviera: la fila llega incompleta a la vista
 * previa, que es donde se ve y se corrige, en vez de tumbar el archivo entero.
 */
function readColumns(object: JsonObject): Partial<Record<TicketColumn, string>> {
  const found: Partial<Record<TicketColumn, string>> = {}

  for (const [key, value] of Object.entries(object)) {
    const column = matchJsonKey(key)
    if (!column || column in found) continue

    if (value === null) found[column] = ''
    else if (typeof value === 'string') found[column] = value.trim()
    else if (typeof value === 'number') found[column] = String(value).trim()
  }

  return found
}

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

  const rows = parsed.data.map((object, index) => {
    const found = readColumns(object)

    return {
      rowNumber: index + 1,
      dailyNumber: found.daily ?? '',
      weeklyNumber: found.weekly ?? '',
      ...(found.clientName !== undefined ? { clientName: found.clientName } : {}),
      ...(found.clientPhone !== undefined ? { clientPhone: found.clientPhone } : {}),
      ...(found.abono !== undefined ? { abono: found.abono } : {}),
    }
  })

  if (rows.every((row) => row.dailyNumber === '' && row.weeklyNumber === '')) {
    throw new ImportParseError(
      'No encontramos los números en el archivo. Cada boleta necesita «daily_number» y «weekly_number».',
    )
  }

  return rows
}
