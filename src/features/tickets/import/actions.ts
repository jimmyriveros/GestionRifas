'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import type { ActionResultWith } from '@/lib/action-result'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

import { comboKey, hasErrors, validateBulkRows } from '../bulk/duplicates'
import {
  clientIdentityKey,
  groupImportClients,
  hasCompleteClientData,
  type ClientResolution,
} from './clients'
import { checkCombinationsSchema, importTicketsSchema } from './schemas'

/**
 * Importacion de boletas desde un archivo (BR-N12, D-081).
 *
 * UN SOLO camino para los tres roles. Lo que cambia entre ellos no es el
 * codigo sino lo que el rol permite, y eso se decide aqui arriba y lo vuelve a
 * decidir la base de datos:
 *
 *   * Personal (Owner/Admin): elige rifa y vendedor. Sin clientes guarda con
 *     `bulk_create_tickets`; con clientes usa la RPC atomica de 0021 (ampliada
 *     en 0033), que reutiliza `assign_ticket_row` y, cuando la fila trae abono,
 *     `create_payment`. Ni una suma de dinero se hace en TypeScript.
 *   * Vendedor: el vendedor es EL MISMO que tiene la sesion; si manda otro id,
 *     se ignora. Sus boletas nacen en `pending_approval` y solo si la rifa lo
 *     permite, cosa que impone `tickets_insert_seller` aunque este codigo se
 *     equivoque (BR-R10).
 *
 * Ninguna de las dos rutas confia en lo que valido el navegador: las filas se
 * vuelven a comprobar con el mismo motor (`validateBulkRows`) antes de escribir.
 */

export type ImportTicketsResult = {
  /** Filas que el navegador mando. */
  requested: number
  /** Boletas creadas de verdad. */
  inserted: number
  /**
   * Combinaciones que la base de datos rechazo por estar ya tomadas, en
   * formato `daily/weekly`. Nunca se dice de quien son (BR-U07).
   */
  conflicts: string[]
  /** Boletas creadas y asignadas a un cliente dentro de la misma transaccion. */
  assigned: number
  /** Clientes nuevos creados para las boletas que realmente entraron. */
  clientsCreated: number
  /** Clientes existentes reutilizados de forma inequívoca. */
  clientsReused: number
  /** Abonos registrados, uno por boleta que traia valor en el archivo. */
  paymentsCreated: number
  /** Suma en pesos de esos abonos. */
  paymentsTotal: number
  /** `false` si la importacion quedo registrada en la bitacora. */
  auditFailed?: boolean
}

type BulkRpcResult = {
  inserted?: number
  conflicts?: { daily_number?: string | null; weekly_number?: string | null }[]
}

type ImportWithClientsRpcResult = BulkRpcResult & {
  assigned?: number
  clients_created?: number
  clients_reused?: number
  payments_created?: number
  payments_total?: number
}

type ClientMatch = {
  client_key: string
  client_id: string
  name: string
  phone: string
  archived_at: string | null
}

export type ImportPreviewCheck = {
  taken: string[]
  clients: ClientResolution[]
  /**
   * Precio vigente de la rifa, leido de `raffles.ticket_price`.
   *
   * Va de vuelta al navegador para que la vista previa interprete los abonos
   * con la cifra REAL y no con la que la pantalla tuviera cargada: quien mira
   * la vista previa tiene que ver el mismo numero que va a aplicar la base de
   * datos (D-098).
   */
  ticketPrice: number
}

/**
 * De las combinaciones indicadas, cuales ya existen en la rifa.
 *
 * Va por `taken_ticket_combinations` (migracion 0019) y no por una consulta
 * normal por un motivo de correccion, no de comodidad: un vendedor no ve las
 * boletas de otros, asi que preguntando por su cuenta le saldria «disponible»
 * una combinacion ya tomada. La funcion responde solo la combinacion, nunca de
 * quien es.
 *
 * Una sola llamada para todo el archivo. Nunca una por fila.
 */
export async function checkImportPreview(
  input: unknown,
): Promise<ActionResultWith<ImportPreviewCheck>> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = checkCombinationsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa el archivo.' }
  }
  const { raffleId, rows } = parsed.data
  const supabase = await createClient()

  // El precio se lee UNA vez y sale por todos los caminos: la vista previa lo
  // necesita para interpretar los abonos, y sin el no puede decir en que
  // estado quedara cada boleta.
  const { data: raffle, error: raffleError } = await supabase
    .from('raffles')
    .select('status, ticket_price')
    .eq('id', raffleId)
    .maybeSingle()

  if (raffleError) return { error: mapPgError(raffleError) }
  if (!raffle) return { error: 'La rifa no existe o no tienes acceso a ella.' }
  const ticketPrice = raffle.ticket_price

  if (rows.length === 0) return { ok: true, data: { taken: [], clients: [], ticketPrice } }

  const { data, error } = await supabase.rpc('taken_ticket_combinations', {
    p_raffle_id: raffleId,
    p_combos: rows.map((row) => ({
      daily_number: row.dailyNumber,
      weekly_number: row.weeklyNumber,
    })),
  })

  if (error) return { error: mapPgError(error) }

  const taken = (data ?? []).map((row) => comboKey(row.daily_number, row.weekly_number))
  const groups = groupImportClients(rows)
  if (groups.length === 0) return { ok: true, data: { taken, clients: [], ticketPrice } }

  if (auth.membership.role === 'seller') {
    return {
      ok: true,
      data: {
        taken,
        ticketPrice,
        clients: groups.map((group) => ({
          ...group,
          status: 'conflict',
          problem:
            'Las boletas con cliente deben importarse desde el portal administrativo para conservar la aprobación del vendedor.',
        })),
      },
    }
  }

  const sellerId = parsed.data.sellerId
  if (!sellerId) return { error: 'Selecciona un vendedor.' }

  if (raffle.status !== 'active') {
    return {
      ok: true,
      data: {
        taken,
        ticketPrice,
        clients: groups.map((group) => ({
          ...group,
          status: 'conflict',
          problem: 'Activa la rifa antes de importar boletas con cliente.',
        })),
      },
    }
  }

  const { data: matchesData, error: matchesError } = await supabase.rpc(
    'match_ticket_import_clients',
    {
      p_raffle_id: raffleId,
      p_seller_id: sellerId,
      p_clients: groups.map((group) => ({
        client_key: group.key,
        name: group.name,
        phone: group.phone,
      })),
    },
  )

  if (matchesError) return { error: mapPgError(matchesError) }
  const matches = (matchesData ?? []) as ClientMatch[]

  const clients: ClientResolution[] = groups.map((group) => {
    const phoneMatches = matches.filter((match) => match.client_key === group.key)
    const exact = phoneMatches.filter(
      (match) => clientIdentityKey(match.name, match.phone) === group.key,
    )

    if (exact.length > 1) {
      return {
        ...group,
        status: 'conflict',
        problem: 'Hay varios clientes con este nombre y celular. Elige uno manualmente.',
      }
    }
    if (exact.length === 1) {
      const match = exact[0]!
      if (match.archived_at) {
        return {
          ...group,
          status: 'conflict',
          problem: 'Este cliente está archivado. Restáuralo antes de importar sus boletas.',
        }
      }
      return { ...group, status: 'existing', clientId: match.client_id }
    }
    if (phoneMatches.length > 0) {
      return {
        ...group,
        status: 'conflict',
        problem: 'Este celular ya está registrado con otro nombre. Revisa el archivo.',
      }
    }
    return { ...group, status: 'new' }
  })

  return {
    ok: true,
    data: { taken, clients, ticketPrice },
  }
}

export async function importTickets(
  input: unknown,
): Promise<ActionResultWith<ImportTicketsResult>> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = importTicketsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa el archivo.' }
  }
  const { raffleId, source, rows } = parsed.data

  // Segunda capa (BR-N10): formato y repeticiones dentro del propio envio. El
  // choque con la rifa lo resuelve la restriccion unica al escribir.
  if (hasErrors(validateBulkRows(rows, { requireComplete: true }))) {
    return { error: 'El archivo tiene filas con números inválidos o repetidos entre sí.' }
  }

  const isSeller = auth.membership.role === 'seller'
  const hasClients = rows.some(hasCompleteClientData)
  if (isSeller && hasClients) {
    return {
      error:
        'Las boletas con cliente deben importarse desde el portal administrativo para conservar la aprobación del vendedor.',
    }
  }
  // BR-U07: el vendedor importa PARA SI MISMO. Lo que venga en `sellerId` no se
  // mira siquiera.
  const sellerId = isSeller ? auth.membership.profileId : parsed.data.sellerId
  if (!sellerId) return { error: 'Selecciona un vendedor.' }

  const result = isSeller
    ? await insertAsSeller(raffleId, rows, auth.membership.organizationId, sellerId)
    : hasClients
      ? await insertAsStaffWithClients(raffleId, sellerId, rows)
      : await insertAsStaff(raffleId, sellerId, rows)

  if ('error' in result) return result

  const clientMetrics = result.data as Partial<{
    assigned: number
    clientsCreated: number
    clientsReused: number
    paymentsCreated: number
    paymentsTotal: number
  }>

  // La bitacora va DESPUES de guardar y a proposito: si fallara, lo que no
  // puede pasar es perder boletas ya creadas. Su fallo se informa, no se calla.
  const { error: auditError } = await (
    await createClient()
  ).rpc('log_ticket_import', {
    p_raffle_id: raffleId,
    p_seller_id: sellerId,
    p_source: source,
    p_requested: rows.length,
    p_inserted: result.data.inserted,
    p_skipped: rows.length - result.data.inserted,
  })

  revalidatePath('/owner/tickets')
  revalidatePath('/owner/dashboard')
  revalidatePath('/seller/tickets')
  revalidatePath('/seller/dashboard')
  // Un archivo con abonos mueve dinero, asi que los listados de pagos y las
  // fichas de cliente tambien dejan de estar al dia.
  revalidatePath('/owner/payments')
  revalidatePath('/seller/payments')
  revalidatePath('/owner/clients')
  revalidatePath('/seller/clients')

  return {
    ok: true,
    data: {
      requested: rows.length,
      inserted: result.data.inserted,
      conflicts: result.data.conflicts,
      assigned: clientMetrics.assigned ?? 0,
      clientsCreated: clientMetrics.clientsCreated ?? 0,
      clientsReused: clientMetrics.clientsReused ?? 0,
      paymentsCreated: clientMetrics.paymentsCreated ?? 0,
      paymentsTotal: clientMetrics.paymentsTotal ?? 0,
      ...(auditError ? { auditFailed: true } : {}),
    },
  }
}

/**
 * Caso administrativo con clientes: una RPC crea boletas, resuelve clientes,
 * asigna y registra los abonos dentro de la misma transaccion. Si una identidad
 * cambia entre la vista previa y la confirmacion, no queda ningun dato parcial:
 * ni cliente, ni boleta, ni pago.
 */
async function insertAsStaffWithClients(
  raffleId: string,
  sellerId: string,
  rows: readonly {
    dailyNumber: string
    weeklyNumber: string
    clientName?: string
    clientPhone?: string
    abono?: number
  }[],
): Promise<
  ActionResultWith<{
    inserted: number
    conflicts: string[]
    assigned: number
    clientsCreated: number
    clientsReused: number
    paymentsCreated: number
    paymentsTotal: number
  }>
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('import_tickets_with_clients', {
    p_raffle_id: raffleId,
    p_seller_id: sellerId,
    p_rows: rows.map((row) => ({
      daily_number: row.dailyNumber,
      weekly_number: row.weeklyNumber,
      ...(row.clientName ? { client_name: row.clientName } : {}),
      ...(row.clientPhone ? { client_phone: row.clientPhone } : {}),
      ...(row.abono !== undefined ? { abono: row.abono } : {}),
    })),
  })

  if (error) return { error: mapPgError(error) }

  const rpc = (data ?? {}) as ImportWithClientsRpcResult
  return {
    ok: true,
    data: {
      inserted: rpc.inserted ?? 0,
      conflicts: (rpc.conflicts ?? []).flatMap((conflict) =>
        conflict.daily_number && conflict.weekly_number
          ? [comboKey(conflict.daily_number, conflict.weekly_number)]
          : [],
      ),
      assigned: rpc.assigned ?? 0,
      clientsCreated: rpc.clients_created ?? 0,
      clientsReused: rpc.clients_reused ?? 0,
      paymentsCreated: rpc.payments_created ?? 0,
      paymentsTotal: rpc.payments_total ?? 0,
    },
  }
}

/**
 * Guardado del personal: una sola llamada a `bulk_create_tickets` con TODO el
 * lote.
 *
 * Una sola llamada y no lotes de 100 como en la carga manual: una funcion de
 * PostgreSQL es una transaccion, asi que si algo inesperado falla no queda una
 * importacion a medias (todo o nada). La carga manual parte en lotes para poder
 * mostrar una barra de progreso mientras alguien teclea 1.000 filas; en una
 * importacion el archivo ya esta listo y lo que importa es que entre entero.
 *
 * Las combinaciones ya tomadas NO son un error inesperado: `on conflict do
 * nothing` las salta y la funcion las devuelve una por una para poder decir
 * exactamente cuales quedaron fuera. Eso es lo contrario de una importacion
 * parcial silenciosa.
 */
async function insertAsStaff(
  raffleId: string,
  sellerId: string,
  rows: readonly { dailyNumber: string; weeklyNumber: string }[],
): Promise<ActionResultWith<{ inserted: number; conflicts: string[] }>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bulk_create_tickets', {
    p_raffle_id: raffleId,
    p_seller_id: sellerId,
    p_rows: rows.map((row) => ({
      daily_number: row.dailyNumber,
      weekly_number: row.weeklyNumber,
    })),
  })

  if (error) return { error: mapPgError(error) }

  const rpc = (data ?? {}) as BulkRpcResult
  return {
    ok: true,
    data: {
      inserted: rpc.inserted ?? 0,
      conflicts: (rpc.conflicts ?? []).flatMap((conflict) =>
        conflict.daily_number && conflict.weekly_number
          ? [comboKey(conflict.daily_number, conflict.weekly_number)]
          : [],
      ),
    },
  }
}

/**
 * Guardado del vendedor: un solo `insert` con todo el lote.
 *
 * Un `insert` con muchas filas tambien es una sola sentencia y por tanto una
 * sola transaccion. `ignoreDuplicates` traduce a `on conflict do nothing`, igual
 * que la RPC del personal.
 *
 * Aqui no se comprueba la rifa a mano: `tickets_insert_seller` exige rifa
 * ACTIVA con `allow_seller_ticket_creation`, estado `pending_approval`, sin
 * cliente y con el vendedor de la sesion. Si algo de eso falla, la base de
 * datos devuelve 42501 y `mapPgError` lo traduce. Se comprueba antes la rifa
 * solo para dar un mensaje mejor que «permiso denegado».
 */
async function insertAsSeller(
  raffleId: string,
  rows: readonly { dailyNumber: string; weeklyNumber: string }[],
  organizationId: string,
  sellerId: string,
): Promise<ActionResultWith<{ inserted: number; conflicts: string[] }>> {
  const supabase = await createClient()

  const { data: raffle, error: raffleError } = await supabase
    .from('raffles')
    .select('id, status, allow_seller_ticket_creation')
    .eq('id', raffleId)
    .maybeSingle()

  if (raffleError) return { error: mapPgError(raffleError) }
  if (!raffle) return { error: 'La rifa no existe o no tienes acceso a ella.' }
  if (raffle.status !== 'active') {
    return { error: 'La rifa no está activa. No se pueden crear boletas.' }
  }
  if (!raffle.allow_seller_ticket_creation) {
    return {
      error: 'Esta rifa no permite que los vendedores creen boletas. Pídelas a tu administrador.',
    }
  }

  const { data, error } = await supabase
    .from('tickets')
    .upsert(
      rows.map((row) => ({
        organization_id: organizationId,
        raffle_id: raffleId,
        seller_id: sellerId,
        daily_number: row.dailyNumber,
        weekly_number: row.weeklyNumber,
        inventory_status: 'pending_approval' as const,
        created_by: sellerId,
      })),
      {
        onConflict: 'organization_id,raffle_id,daily_number,weekly_number',
        ignoreDuplicates: true,
      },
    )
    .select('daily_number, weekly_number')

  if (error) return { error: mapPgError(error) }

  const insertedKeys = new Set(
    (data ?? []).flatMap((row) =>
      row.daily_number && row.weekly_number ? [comboKey(row.daily_number, row.weekly_number)] : [],
    ),
  )

  return {
    ok: true,
    data: {
      inserted: insertedKeys.size,
      conflicts: rows
        .map((row) => comboKey(row.dailyNumber, row.weeklyNumber))
        .filter((key) => !insertedKeys.has(key)),
    },
  }
}
