'use server'

import { revalidatePath } from 'next/cache'

import { toClientRow } from '@/features/clients/schemas'
import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/action-result'

import { assignTicketSchema, assignTicketToNewClientSchema } from './schemas'

/**
 * Asignacion de boletas a clientes.
 *
 * TODA la logica vive en la RPC `assign_ticket` de la Fase 2, que en una sola
 * transaccion: comprueba que la boleta sea del vendedor (o que quien llama sea
 * personal), que este `available`, que el cliente sea de esa misma cartera y no
 * este archivado, que la rifa este activa, COPIA el precio vigente a
 * `sale_price` (BR-P03) y audita el cambio.
 *
 * Reimplementar cualquiera de esas reglas aqui seria duplicarlas y perder la
 * atomicidad. Estas acciones solo traducen el resultado a la interfaz.
 */

function revalidateAssignment(ticketId: string) {
  revalidatePath('/seller/tickets')
  revalidatePath(`/seller/tickets/${ticketId}`)
  revalidatePath('/seller/clients')
  revalidatePath('/seller/dashboard')
  revalidatePath('/owner/tickets')
  revalidatePath(`/owner/tickets/${ticketId}`)
  revalidatePath('/owner/dashboard')
}

export async function assignTicket(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = assignTicketSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const { ticketId, clientId, saleDate } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('assign_ticket', {
    p_ticket_id: ticketId,
    p_client_id: clientId,
    p_sale_date: saleDate,
  })

  if (error) return { error: mapPgError(error) }

  revalidateAssignment(ticketId)
  return { ok: true }
}

/**
 * Crea el cliente y le asigna la boleta sin salir del flujo.
 *
 * No son atomicos entre si a proposito: si la asignacion falla (por ejemplo,
 * porque otro dispositivo tomo la boleta un segundo antes), el cliente recien
 * creado SE CONSERVA. Es un dato legitimo que la persona acaba de capturar y
 * borrarlo la obligaria a escribirlo otra vez; basta con elegir otra boleta.
 * El mensaje de error lo dice explicitamente (D-050).
 */
export async function assignTicketToNewClient(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = assignTicketToNewClientSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del cliente.' }
  }
  const { ticketId, saleDate, client } = parsed.data

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

  const { error } = await supabase.rpc('assign_ticket', {
    p_ticket_id: ticketId,
    p_client_id: created.id,
    p_sale_date: saleDate,
  })

  if (error) {
    revalidateAssignment(ticketId)
    return {
      error: `${mapPgError(error)} El cliente si quedo guardado: puedes asignarle otra boleta.`,
    }
  }

  revalidateAssignment(ticketId)
  return { ok: true }
}
