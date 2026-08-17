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
 * (o que quien llama sea personal), que este `available`, que el cliente sea de
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
 */

function revalidateAssignment() {
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
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = assignTicketsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const { ticketIds, clientId, saleDate, salePrice } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bulk_assign_tickets', {
    p_ticket_ids: ticketIds,
    p_client_id: clientId,
    p_sale_date: saleDate,
    p_sale_price: salePrice,
  })

  if (error) return { error: mapPgError(error) }

  revalidateAssignment()
  const count = data ?? ticketIds.length
  return { ok: true, data: { count, message: assignedMessage(count) } }
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
export async function assignTicketsToNewClient(
  input: unknown,
): Promise<ActionResultWith<{ count: number; message: string }>> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = assignTicketsToNewClientSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del cliente.' }
  }
  const { ticketIds, saleDate, salePrice, client } = parsed.data

  const supabase = await createClient()

  const { data: created, error: clientError } = await supabase
    .from('clients')
    .insert({
      organization_id: auth.membership.organizationId,
      seller_id: auth.membership.profileId,
      ...toClientRow(client),
    })
    .select('id')
    .single()

  if (clientError) return { error: mapPgError(clientError) }

  const { data, error } = await supabase.rpc('bulk_assign_tickets', {
    p_ticket_ids: ticketIds,
    p_client_id: created.id,
    p_sale_date: saleDate,
    p_sale_price: salePrice,
  })

  if (error) {
    revalidateAssignment()
    return {
      error: `${mapPgError(error)} El cliente sí quedó guardado: puedes asignarle otras boletas.`,
    }
  }

  revalidateAssignment()
  const count = data ?? ticketIds.length
  return { ok: true, data: { count, message: assignedMessage(count) } }
}
