'use server'

import { revalidatePath } from 'next/cache'

import { toClientRow } from '@/features/clients/schemas'
import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResultWith } from '@/lib/action-result'

import { assignTicketsSchema, assignTicketsToNewClientSchema } from './schemas'

/**
 * Asignacion de boletas a clientes.
 *
 * TODA la logica vive en la RPC `bulk_assign_tickets` (migracion 0020), que a
 * su vez aplica boleta por boleta las reglas de `assign_ticket_row` —las mismas
 * de siempre, extraidas de la Fase 2—: comprueba que la boleta sea del vendedor
 * que llama, que este `available`, que el cliente sea de
 * esa misma cartera y no este archivado, que la rifa este activa, fija
 * `sale_price` y audita el cambio.
 *
 * El precio de venta puede venir rebajado (BR-P09, D-099). Si no viene, se usa
 * el vigente de la rifa, que es lo de siempre. Quien decide si la rebaja cabe es
 * `assign_ticket_row`, con la fila bloqueada y contra la forma de pago real de
 * ese vendedor: la casilla del formulario no es la frontera de seguridad.
 *
 * UNA boleta o VEINTE recorren exactamente el mismo camino (seccion 29 del
 * encargo). Y como una funcion de PostgreSQL es una transaccion, veinte boletas
 * se venden todas o no se vende ninguna: nunca quedan siete asignadas y trece
 * sueltas.
 *
 * Reimplementar cualquiera de esas reglas aqui seria duplicarlas y perder la
 * atomicidad. Estas acciones solo traducen el resultado a la interfaz.
 *
 * SOLO EL VENDEDOR, desde D-198: vender es parte de su cartera (BR-Q01). El
 * personal ya no asigna boletas a clientes, y `assign_ticket_row` se lo niega
 * con el mismo mensaje que a una boleta ajena aunque llegara hasta aqui.
 */

function revalidateAssignment() {
  revalidatePath('/seller/inventory')
  revalidatePath('/seller/tickets')
  revalidatePath('/seller/tickets/[ticketId]', 'page')
  revalidatePath('/seller/clients')
  revalidatePath('/seller/dashboard')
  revalidatePath('/owner/tickets')
  revalidatePath('/owner/tickets/[ticketId]', 'page')
  revalidatePath('/owner/dashboard')
}

function assignedMessage(count: number): string {
  return count === 1 ? 'Boleta asignada.' : `Se asignaron ${count} boletas.`
}

export async function assignTickets(
  input: unknown,
): Promise<ActionResultWith<{ count: number; message: string }>> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = assignTicketsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const { ticketIds, clientId, saleDate, salePrice, holdId } = parsed.data

  const supabase = await createClient()
  const sale = await runSale(supabase, { ticketIds, clientId, saleDate, salePrice, holdId })
  if ('error' in sale) return { error: mapPgError(sale.error) }

  revalidateAssignment()
  const count = sale.count
  return { ok: true, data: { count, message: assignedMessage(count) } }
}

/**
 * Una venta: la de siempre sobre boletas del vendedor (`bulk_assign_tickets`),
 * o la de UNA boleta apartada del inventario comun (`sell_ticket_hold`, D-257),
 * que cierra el apartado, le pone el vendedor a la boleta y aplica las mismas
 * reglas de `assign_ticket_row`. Con un apartado que vencio o que ya no es el
 * vigente, la base no vende nada.
 */
async function runSale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sale: {
    ticketIds: string[]
    clientId: string
    saleDate: string
    salePrice?: number
    holdId?: string
  },
): Promise<{ count: number } | { error: unknown }> {
  if (sale.holdId) {
    const { error } = await supabase.rpc('sell_ticket_hold', {
      p_hold_id: sale.holdId,
      p_client_id: sale.clientId,
      p_sale_date: sale.saleDate,
      ...(sale.salePrice !== undefined ? { p_sale_price: sale.salePrice } : {}),
    })
    if (error) return { error }
    return { count: 1 }
  }
  const { data, error } = await supabase.rpc('bulk_assign_tickets', {
    p_ticket_ids: sale.ticketIds,
    p_client_id: sale.clientId,
    p_sale_date: sale.saleDate,
    p_sale_price: sale.salePrice,
  })
  if (error) return { error }
  return { count: data ?? sale.ticketIds.length }
}

/**
 * Crea el cliente y le asigna las boletas sin salir del flujo.
 *
 * El alta del cliente y la asignacion no son atomicas ENTRE SI a proposito: si
 * la asignacion falla (por ejemplo, porque otro dispositivo tomo una boleta un
 * segundo antes), el cliente recien creado SE CONSERVA. Es un dato legitimo que
 * la persona acaba de capturar y borrarlo la obligaria a escribirlo otra vez;
 * basta con elegir otras boletas. El mensaje de error lo dice explicitamente
 * (D-050).
 *
 * La asignacion en si sigue siendo todo o nada: o se venden todas las boletas
 * del lote o no se vende ninguna.
 */
export async function assignTicketsToNewClient(input: unknown): Promise<
  ActionResultWith<{
    count: number
    message: string
    /** El cliente que se acaba de crear, para poder invitarlo (BR-W05, D-176). */
    client: { id: string; name: string; phone: string }
  }>
> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = assignTicketsToNewClientSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del cliente.' }
  }
  const { ticketIds, saleDate, salePrice, client, holdId } = parsed.data

  const supabase = await createClient()

  const { data: created, error: clientError } = await supabase
    .from('clients')
    .insert({
      organization_id: auth.membership.organizationId,
      seller_id: auth.membership.profileId,
      ...toClientRow(client),
    })
    // El telefono sale de la fila escrita, no del formulario: es el que usara
    // la invitacion de WhatsApp (BR-W05).
    .select('id, name, phone')
    .single()

  if (clientError) return { error: mapPgError(clientError) }

  const sale = await runSale(supabase, {
    ticketIds,
    clientId: created.id,
    saleDate,
    salePrice,
    holdId,
  })

  if ('error' in sale) {
    revalidateAssignment()
    return {
      error: `${mapPgError(sale.error)} El cliente sí quedó guardado: puedes asignarle otras boletas.`,
    }
  }

  revalidateAssignment()
  const count = sale.count
  return {
    ok: true,
    data: {
      count,
      message: assignedMessage(count),
      client: { id: created.id, name: created.name, phone: created.phone },
    },
  }
}
