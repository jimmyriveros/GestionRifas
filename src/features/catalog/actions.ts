'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/action-result'

import { catalogSettingsSchema, regenerateCatalogSlugSchema } from './schemas'
import { buildSellerSlug } from './slug'

/**
 * Configuracion del catalogo publico de un vendedor (BR-K04..BR-K06, BR-K12).
 *
 * SOLO EL PERSONAL. Un vendedor VE su enlace y lo copia, pero no se configura a
 * si mismo: `authorizeAction(['owner','admin'])` lo rechaza aqui, y la politica
 * `memberships_update_staff` (0014) lo rechaza otra vez en la base de datos. No
 * es una comprobacion repetida por descuido: la de arriba da un mensaje util,
 * la de abajo es la que de verdad manda (docs/SECURITY.md 1).
 *
 * No hay accion nueva de auditoria: `audit_memberships` (0006) ya anota
 * cualquier cambio de esta tabla con sus valores anterior y nuevo.
 */

/** Cuantas veces se reintenta si el slug aleatorio ya estaba cogido. */
const SLUG_ATTEMPTS = 5

/** Codigo de PostgreSQL para violacion de restriccion unica. */
const UNIQUE_VIOLATION = '23505'

/**
 * Escribe un slug nuevo, reintentando si choca con uno existente.
 *
 * La colision es improbable —cuatro caracteres de un alfabeto de 31— pero no
 * imposible, y quien la sufriria seria justo la segunda persona con el mismo
 * nombre. El indice unico es el que decide; esto solo vuelve a tirar el dado.
 */
async function assignSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  fullName: string,
): Promise<{ slug: string } | { error: string }> {
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const slug = buildSellerSlug(fullName)
    const { data, error } = await supabase
      .from('memberships')
      .update({ public_slug: slug })
      .eq('profile_id', profileId)
      .eq('role', 'seller')
      .select('profile_id')

    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue
      return { error: mapPgError(error) }
    }
    // Cero filas: la politica de escritura no dejo pasar el UPDATE. Ocurre sin
    // error, igual que en `updateUser` (BR-U02), asi que hay que mirarlo.
    if (!data || data.length === 0) {
      return { error: 'No pudimos guardar los cambios. Revisa tus permisos.' }
    }
    return { slug }
  }

  return { error: 'No pudimos generar el enlace. Vuelve a intentarlo.' }
}

/** Nombre del vendedor, para la parte legible del enlace. */
async function sellerFullName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', profileId)
    .maybeSingle()

  if (error || !data) return null
  return data.full_name
}

export async function saveCatalogSettings(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = catalogSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()

  // Encender el catalogo sin enlace lo crea en el momento: nadie tiene que
  // acordarse de generarlo primero. Si ya lo tiene, NO se toca — cambiarlo aqui
  // invalidaria en silencio las direcciones ya repartidas (BR-K03).
  if (values.enabled) {
    const { data: current, error: currentError } = await supabase
      .from('memberships')
      .select('public_slug')
      .eq('profile_id', values.profileId)
      .eq('role', 'seller')
      .maybeSingle()

    if (currentError) return { error: mapPgError(currentError) }
    if (!current) return { error: 'No encontramos a ese vendedor.' }

    if (current.public_slug === null) {
      const fullName = await sellerFullName(supabase, values.profileId)
      if (fullName === null) return { error: 'No encontramos a ese vendedor.' }

      const assigned = await assignSlug(supabase, values.profileId, fullName)
      if ('error' in assigned) return assigned
    }
  }

  const { data, error } = await supabase
    .from('memberships')
    .update({
      public_catalog_enabled: values.enabled,
      public_whatsapp_number: values.whatsappNumber === '' ? null : values.whatsappNumber,
      public_raffle_id: values.raffleId === '' ? null : values.raffleId,
    })
    .eq('profile_id', values.profileId)
    .eq('role', 'seller')
    .select('profile_id')

  if (error) return { error: mapPgError(error) }
  if (!data || data.length === 0) {
    return { error: 'No pudimos guardar los cambios. Revisa tus permisos.' }
  }

  revalidatePath(`/owner/sellers/${values.profileId}`)
  revalidatePath('/seller/dashboard')
  return { ok: true }
}

/**
 * Regenerar el enlace: rompe el anterior a proposito.
 *
 * Es una accion SEPARADA de guardar (BR-K03) porque su consecuencia es
 * distinta: la direccion que el vendedor ya repartio deja de funcionar. Se pide
 * cuando el enlace se filtro a quien no debia, no cuando se corrige un dato.
 */
export async function regenerateCatalogSlug(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = regenerateCatalogSlugSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const { profileId } = parsed.data

  const supabase = await createClient()
  const fullName = await sellerFullName(supabase, profileId)
  if (fullName === null) return { error: 'No encontramos a ese vendedor.' }

  const assigned = await assignSlug(supabase, profileId, fullName)
  if ('error' in assigned) return assigned

  revalidatePath(`/owner/sellers/${profileId}`)
  revalidatePath('/seller/dashboard')
  return { ok: true }
}
