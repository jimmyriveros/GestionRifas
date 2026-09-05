'use server'

import { revalidatePath } from 'next/cache'

import { listClientOptions, type ClientOption } from '@/features/clients/queries'
import { searchTermSchema, toClientRow } from '@/features/clients/schemas'
import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult, ActionResultWith } from '@/lib/action-result'

import {
  approveTicketsSchema,
  cancelTicketSchema,
  createTicketSchema,
  reassignTicketClientSchema,
  reassignTicketSellerSchema,
  reassignTicketToNewClientSchema,
  releaseTicketSchema,
  ticketClientSearchSchema,
  updateTicketNumbersSchema,
  updateTicketSalePriceSchema,
} from './schemas'

/**
 * Server Actions de boletas.
 *
 * Aprobar, anular y crear en lote pasan por las RPC de la Fase 2
 * (`approve_tickets`, `cancel_ticket`, `bulk_create_tickets`): son
 * transaccionales, validan permisos por su cuenta y escriben la auditoria.
 * Reimplementar esa logica aqui seria duplicarla y perder la transaccion.
 */

function revalidateTickets(ticketId?: string) {
  revalidatePath('/owner/tickets')
  revalidatePath('/owner/dashboard')
  if (ticketId) revalidatePath(`/owner/tickets/${ticketId}`)
}

/**
 * Superficies que leen `sale_price` o un total que sale de el. El detalle se
 * nombra por patron Y por ruta literal: revalidar `/seller/tickets` no alcanza
 * a `[ticketId]` (D-133).
 */
function revalidateTicketPrice(ticketId: string, clientId?: string | null) {
  revalidatePath('/seller/tickets')
  revalidatePath('/seller/tickets/[ticketId]', 'page')
  revalidatePath(`/seller/tickets/${ticketId}`)
  revalidatePath('/seller/dashboard')
  revalidatePath('/seller/payments')
  revalidatePath('/seller/clients')
  revalidatePath('/owner/tickets')
  revalidatePath('/owner/tickets/[ticketId]', 'page')
  revalidatePath(`/owner/tickets/${ticketId}`)
  revalidatePath('/owner/dashboard')
  revalidatePath('/owner/payments')
  revalidatePath('/owner/clients')
  if (clientId) {
    revalidatePath(`/seller/clients/${clientId}`)
    revalidatePath(`/owner/clients/${clientId}`)
  }
}

export async function createTicket(input: unknown): Promise<ActionResultWith<{ id: string }>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = createTicketSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()

  const { data: raffle, error: raffleError } = await supabase
    .from('raffles')
    .select('id, status')
    .eq('id', values.raffleId)
    .maybeSingle()

  if (raffleError) return { error: mapPgError(raffleError) }
  if (!raffle) return { error: 'La rifa no existe o no tienes acceso a ella.' }

  // BR-R08: una rifa cerrada o anulada no admite boletas nuevas. La RPC de
  // creacion masiva lo comprueba en SQL; el INSERT directo no, asi que la regla
  // se aplica aqui.
  if (raffle.status !== 'draft' && raffle.status !== 'active') {
    return { error: 'La rifa está cerrada o anulada y no admite boletas nuevas.' }
  }

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      organization_id: auth.membership.organizationId,
      raffle_id: values.raffleId,
      seller_id: values.sellerId,
      daily_number: values.dailyNumber,
      weekly_number: values.weeklyNumber,
      // BR-I04: creada por el personal, con ambos numeros y sin cliente.
      inventory_status: 'available',
      created_by: auth.membership.profileId,
      // internal_code lo genera un trigger (D-039).
    })
    .select('id')
    .single()

  if (error) return { error: mapPgError(error) }

  revalidateTickets()
  return { ok: true, data: { id: data.id } }
}

export async function updateTicketNumbers(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = updateTicketNumbersSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { data: ticket, error: readError } = await supabase
    .from('tickets')
    .select('id, inventory_status')
    .eq('id', values.ticketId)
    .maybeSingle()

  if (readError) return { error: mapPgError(readError) }
  if (!ticket) return { error: 'La boleta no existe o no tienes acceso a ella.' }

  // BR-I06: una boleta anulada conserva sus numeros tal como quedaron; es
  // historia y no se reescribe (D-046).
  if (ticket.inventory_status === 'cancelled') {
    return { error: 'La boleta está anulada y sus números ya no se pueden cambiar.' }
  }

  const { error } = await supabase
    .from('tickets')
    .update({
      daily_number: values.dailyNumber,
      weekly_number: values.weeklyNumber,
      // CLAUDE.md 15: completar un borrador con sus dos numeros lo deja listo
      // para vender. El resto de estados no cambia por editar los numeros.
      ...(ticket.inventory_status === 'draft' ? { inventory_status: 'available' as const } : {}),
    })
    .eq('id', values.ticketId)

  if (error) return { error: mapPgError(error) }

  revalidateTickets(values.ticketId)
  return { ok: true }
}

/**
 * Cambia el vendedor de UNA boleta.
 *
 * Va por `bulk_change_ticket_seller` con un solo id: es la misma funcion que
 * usa el cambio en lote, asi que las reglas —ni asignada ni anulada (BR-C05),
 * destino vendedor activo de la organizacion— se escriben una sola vez y en
 * SQL, donde ademas quedan protegidas de una llamada directa a la API
 * (seccion 43 del encargo). Antes vivian aqui, en un UPDATE sujeto a RLS.
 */
export async function reassignTicketSeller(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = reassignTicketSellerSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('bulk_change_ticket_seller', {
    p_ticket_ids: [values.ticketId],
    p_seller_id: values.sellerId,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTickets(values.ticketId)
  revalidatePath('/owner/sellers')
  return { ok: true }
}

export async function approveTickets(input: unknown): Promise<ActionResultWith<{ count: number }>> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = approveTicketsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Selecciona al menos una boleta.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('approve_tickets', {
    p_ticket_ids: parsed.data.ticketIds,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTickets()
  return { ok: true, data: { count: data ?? 0 } }
}

export async function cancelTicket(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = cancelTicketSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_ticket', {
    p_ticket_id: parsed.data.ticketId,
    p_reason: parsed.data.reason,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTickets(parsed.data.ticketId)
  return { ok: true }
}

/**
 * Corregir el precio de venta de una boleta ya asignada (BR-P13, D-137).
 *
 * El vendedor dueno de la boleta y el personal pueden. La RPC lo vuelve a
 * comprobar: no basta con ocultar el icono. Aqui no se resta ni se decide
 * estado: `update_ticket_sale_price` escribe el importe y los disparadores
 * vigentes recalculan saldo, estado de pago y ganancia.
 */
export async function updateTicketSalePrice(
  input: unknown,
): Promise<ActionResultWith<{ id: string }>> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = updateTicketSalePriceSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('client_id')
    .eq('id', values.ticketId)
    .maybeSingle()

  const { data, error } = await supabase.rpc('update_ticket_sale_price', {
    p_ticket_id: values.ticketId,
    p_sale_price: values.salePrice,
    p_expected_sale_price: values.expectedSalePrice,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTicketPrice(values.ticketId, ticket?.client_id)
  return { ok: true, data: { id: data as string } }
}

/**
 * Superficies que cambian al mover una boleta de cliente (D-168).
 *
 * Son mas que las del precio: la boleta desaparece de la ficha del cliente
 * anterior y aparece en la del nuevo, asi que las DOS fichas hay que
 * revalidarlas por su ruta literal. El detalle se nombra ademas por patron,
 * porque revalidar `/seller/tickets` no alcanza a `[ticketId]` (D-133).
 *
 * Liberar una boleta (D-169) es el mismo mapa con `nextClientId` en `null`: sale
 * de la ficha del cliente anterior y no entra en ninguna otra.
 */
function revalidateTicketClient(
  ticketId: string,
  previousClientId: string,
  nextClientId: string | null,
) {
  revalidatePath('/seller/tickets')
  revalidatePath('/seller/tickets/[ticketId]', 'page')
  revalidatePath(`/seller/tickets/${ticketId}`)
  revalidatePath('/seller/clients')
  revalidatePath('/seller/payments')
  revalidatePath('/seller/dashboard')
  revalidatePath('/owner/tickets')
  revalidatePath('/owner/tickets/[ticketId]', 'page')
  revalidatePath(`/owner/tickets/${ticketId}`)
  revalidatePath('/owner/clients')
  revalidatePath('/owner/payments')
  revalidatePath('/owner/dashboard')
  revalidatePath('/owner/reports')
  revalidatePath('/seller/reports')
  for (const clientId of [previousClientId, nextClientId]) {
    if (!clientId) continue
    revalidatePath(`/seller/clients/${clientId}`)
    revalidatePath(`/owner/clients/${clientId}`)
  }
}

/**
 * Clientes elegibles para corregir el cliente de una boleta (BR-I13, D-168).
 *
 * Acota SIEMPRE a la cartera del vendedor de la boleta. En el portal del
 * vendedor esa cartera es la suya y la RLS ya lo haria; en el administrativo no,
 * porque el personal ve los clientes de toda la organizacion y ofrecerselos
 * todos seria proponer opciones que la base va a rechazar (BR-C05).
 *
 * Devuelve lista vacia en vez de error cuando el termino no sirve: un selector
 * que se queja de que escribiste una sola letra es mas molesto que util.
 */
export async function searchTicketClientOptions(
  input: unknown,
): Promise<ActionResultWith<ClientOption[]>> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = ticketClientSearchSchema.safeParse(input)
  if (!parsed.success) return { ok: true, data: [] }

  const term = searchTermSchema.safeParse(parsed.data.term)
  if (!term.success) return { ok: true, data: [] }

  const supabase = await createClient()
  // El vendedor sale de la BOLETA, no del navegador. Bajo RLS: una boleta que
  // quien llama no puede ver simplemente no aparece.
  const { data: ticket, error } = await supabase
    .from('tickets')
    .select('seller_id')
    .eq('id', parsed.data.ticketId)
    .maybeSingle()

  if (error) return { error: mapPgError(error) }
  if (!ticket) return { ok: true, data: [] }

  try {
    return {
      ok: true,
      data: await listClientOptions(term.data, undefined, { sellerId: ticket.seller_id }),
    }
  } catch (searchError) {
    return { error: mapPgError(searchError) }
  }
}

/**
 * Corregir el cliente de una boleta vendida (BR-I13, D-168).
 *
 * El vendedor dueno de la boleta y el personal pueden. TODA la regla vive en
 * `reassign_ticket_client`: cartera, archivado, historial de abonos,
 * coincidencias de loteria y el bloqueo optimista con la fila bloqueada.
 * Ocultar el boton no autoriza nada.
 */
export async function reassignTicketClient(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = reassignTicketClientSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('reassign_ticket_client', {
    p_ticket_id: values.ticketId,
    p_expected_client_id: values.expectedClientId,
    p_new_client_id: values.newClientId,
    p_reason: values.reason,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTicketClient(values.ticketId, values.expectedClientId, values.newClientId)
  return { ok: true }
}

/**
 * Crea el cliente correcto y le pasa la boleta, sin salir del dialogo.
 *
 * El alta y la correccion NO son atomicas entre si, a proposito y por la misma
 * razon que en la venta (D-050): si la correccion falla —porque alguien cobro
 * la boleta un segundo antes, por ejemplo—, el cliente recien escrito SE
 * CONSERVA. Es un dato legitimo que la persona acaba de capturar. El mensaje de
 * error lo dice explicitamente para que nadie lo escriba dos veces.
 *
 * `seller_id` NUNCA viene del navegador: sale de la boleta. En el portal del
 * vendedor coincide con su sesion; en el administrativo, el cliente nuevo nace
 * en la cartera del vendedor de la boleta, no a nombre de quien administra
 * (BR-C05).
 */
export async function reassignTicketToNewClient(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = reassignTicketToNewClientSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del cliente.' }
  }
  const values = parsed.data

  const supabase = await createClient()

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select('organization_id, seller_id')
    .eq('id', values.ticketId)
    .maybeSingle()

  if (ticketError) return { error: mapPgError(ticketError) }
  if (!ticket) return { error: 'La boleta no existe o no tienes acceso a ella.' }

  const { data: created, error: clientError } = await supabase
    .from('clients')
    .insert({
      organization_id: ticket.organization_id,
      seller_id: ticket.seller_id,
      ...toClientRow(values.client),
    })
    .select('id')
    .single()

  if (clientError) return { error: mapPgError(clientError) }

  const { error } = await supabase.rpc('reassign_ticket_client', {
    p_ticket_id: values.ticketId,
    p_expected_client_id: values.expectedClientId,
    p_new_client_id: created.id,
    p_reason: values.reason,
  })

  if (error) {
    revalidateTicketClient(values.ticketId, values.expectedClientId, created.id)
    return {
      error: `${mapPgError(error)} El cliente sí quedó guardado: puedes elegirlo de la lista e intentarlo otra vez.`,
    }
  }

  revalidateTicketClient(values.ticketId, values.expectedClientId, created.id)
  return { ok: true }
}

/**
 * Liberar una boleta vendida que nadie ha abonado (BR-I14, D-169).
 *
 * El vendedor dueno de la boleta y el personal pueden. TODA la regla vive en
 * `release_ticket_client`: permisos, estado, rifa activa, historial de abonos,
 * coincidencias de loteria y el bloqueo optimista con la fila bloqueada.
 * Ocultar el boton no autoriza nada.
 *
 * No hace falta leer la boleta antes: el cliente que hay que revalidar es el
 * mismo `expectedClientId` que la RPC exige que siga siendo el suyo, asi que si
 * la llamada tuvo exito ese es, con certeza, el cliente que la tenia.
 */
export async function releaseTicket(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = releaseTicketSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('release_ticket_client', {
    p_ticket_id: values.ticketId,
    p_expected_client_id: values.expectedClientId,
    p_reason: values.reason,
  })

  if (error) return { error: mapPgError(error) }

  revalidateTicketClient(values.ticketId, values.expectedClientId, null)
  return { ok: true }
}
