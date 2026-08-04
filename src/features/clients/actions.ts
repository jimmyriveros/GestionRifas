'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult, ActionResultWith } from '@/lib/action-result'

import {
  createClientSchema,
  setClientArchivedSchema,
  toClientRow,
  updateClientSchema,
} from './schemas'

/**
 * Server Actions de clientes.
 *
 * `seller_id` NUNCA viene del cliente: se toma de la sesion (docs/SECURITY.md 5).
 * Aunque llegara manipulado, la politica `clients_insert` solo deja al vendedor
 * crear clientes a su propio nombre, y su WITH CHECK impide ademas transferir
 * un cliente a otro vendedor (BR-C05, verificado: devuelve 42501).
 */

function revalidateClients(clientId?: string) {
  revalidatePath('/seller/clients')
  revalidatePath('/seller/dashboard')
  revalidatePath('/owner/clients')
  if (clientId) {
    revalidatePath(`/seller/clients/${clientId}`)
    revalidatePath(`/owner/clients/${clientId}`)
  }
}

export async function createClientRecord(
  input: unknown,
): Promise<ActionResultWith<{ id: string; name: string }>> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = createClientSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .insert({
      organization_id: auth.membership.organizationId,
      seller_id: auth.membership.profileId, // BR-C01: siempre el vendedor de la sesion
      ...toClientRow(parsed.data),
    })
    .select('id, name')
    .single()

  if (error) return { error: mapPgError(error) }

  revalidateClients()
  return { ok: true, data: { id: data.id, name: data.name } }
}

export async function updateClientRecord(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = updateClientSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const { clientId, ...values } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .update(toClientRow(values))
    .eq('id', clientId)
    .select('id')

  if (error) return { error: mapPgError(error) }

  // RLS no lanza al rechazar: deja cero filas (docs/SECURITY.md 5.1).
  if (!data || data.length === 0) {
    return { error: 'El cliente no existe o no tienes acceso a el.' }
  }

  revalidateClients(clientId)
  return { ok: true }
}

/**
 * BR-C06: los clientes NUNCA se eliminan. Archivar es reversible y conserva
 * todo el historial; un cliente archivado desaparece de los selectores de
 * asignacion (BR-C07) pero sigue teniendo perfil.
 */
export async function setClientArchived(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = setClientArchivedSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Cliente no valido.' }
  }
  const { clientId, archived } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', clientId)
    .select('id')

  if (error) return { error: mapPgError(error) }
  if (!data || data.length === 0) {
    return { error: 'El cliente no existe o no tienes acceso a el.' }
  }

  revalidateClients(clientId)
  return { ok: true }
}
