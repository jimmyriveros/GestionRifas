'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/action-result'

import {
  createUserSchema,
  resendInvitationSchema,
  setUserActiveSchema,
  updateUserSchema,
} from './schemas'

/**
 * Alta y mantenimiento de administradores y vendedores.
 *
 * Reparto de responsabilidades (D-045):
 *   * La cuenta de Supabase Auth se crea con la SERVICE ROLE, porque
 *     `auth.admin` no existe de otra forma. Solo toca `auth`, jamas datos de
 *     negocio.
 *   * La MEMBRESIA se inserta con el cliente de sesion, sujeto a RLS: es la
 *     politica `memberships_insert_staff` la que impide a un Admin crear un
 *     owner (BR-U03), no una comprobacion de TypeScript.
 *
 * El alta es por INVITACION por correo: nunca existe una contrasena en texto
 * plano, ni en la interfaz ni en la base de datos (CLAUDE.md 9 y 26). La
 * persona define su contrasena desde el enlace, que reutiliza el flujo de
 * `/auth/callback` -> `/reset-password` de la Fase 1.
 */

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? ''
}

export async function createUser(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = createUserSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const admin = createAdminClient()
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    values.email,
    {
      data: {
        full_name: values.fullName,
        alias: values.alias === '' ? null : values.alias,
        phone: values.phone,
      },
      redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
    },
  )

  if (inviteError || !invited?.user) {
    return { error: mapPgError(inviteError) }
  }

  const profileId = invited.user.id

  const supabase = await createClient()
  const { error: membershipError } = await supabase.from('memberships').insert({
    organization_id: auth.membership.organizationId,
    profile_id: profileId,
    role: values.role,
    invited_by: auth.membership.profileId,
  })

  if (membershipError) {
    // Compensacion: sin membresia la cuenta no sirve para nada y dejaria un
    // correo bloqueado para siempre. Se elimina la cuenta recien creada para
    // que el alta pueda reintentarse.
    await admin.auth.admin.deleteUser(profileId)
    return { error: mapPgError(membershipError) }
  }

  revalidatePath('/owner/users')
  revalidatePath('/owner/sellers')
  revalidatePath('/owner/dashboard')
  return { ok: true }
}

export async function updateUser(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = updateUserSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: values.fullName,
      alias: values.alias === '' ? null : values.alias,
      phone: values.phone,
    })
    .eq('id', values.profileId)
    .select('id')

  if (error) return { error: mapPgError(error) }

  // BR-U02: si la fila objetivo es la del Owner y quien edita es un Admin, la
  // politica `profiles_update_staff` no la deja pasar y el UPDATE afecta CERO
  // filas SIN error. Sin esta comprobacion la interfaz diria "guardado" tras
  // no haber guardado nada.
  if (!data || data.length === 0) {
    return { error: 'No tienes permiso para editar a este usuario.' }
  }

  revalidatePath('/owner/users')
  revalidatePath('/owner/sellers')
  revalidatePath(`/owner/sellers/${values.profileId}`)
  return { ok: true }
}

export async function setUserActive(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = setUserActiveSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const { profileId, isActive } = parsed.data

  if (profileId === auth.membership.profileId && !isActive) {
    return { error: 'No puedes desactivar tu propia cuenta.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .update({ is_active: isActive })
    .eq('profile_id', profileId)
    .eq('organization_id', auth.membership.organizationId)
    .select('id')

  if (error) return { error: mapPgError(error) }

  // BR-U02: mismo caso que en updateUser. Un Admin intentando desactivar al
  // Owner no produce error de RLS, produce cero filas afectadas.
  if (!data || data.length === 0) {
    return { error: 'No tienes permiso para cambiar el estado de este usuario.' }
  }

  revalidatePath('/owner/users')
  revalidatePath('/owner/sellers')
  revalidatePath(`/owner/sellers/${profileId}`)
  revalidatePath('/owner/dashboard')
  return { ok: true }
}

export async function resendInvitation(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = resendInvitationSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Usuario no valido.' }
  }

  // La consulta pasa por RLS: si el usuario no es de la organizacion de quien
  // llama, sencillamente no aparece.
  const supabase = await createClient()
  const { data: member, error: readError } = await supabase
    .from('memberships')
    .select('profile:profiles!memberships_profile_id_fkey ( email )')
    .eq('profile_id', parsed.data.profileId)
    .eq('organization_id', auth.membership.organizationId)
    .maybeSingle()

  if (readError) return { error: mapPgError(readError) }
  if (!member?.profile?.email) return { error: 'El usuario no existe o no tienes acceso a el.' }

  const admin = createAdminClient()
  const { error } = await admin.auth.resetPasswordForEmail(member.profile.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  })

  if (error) return { error: mapPgError(error) }

  return { ok: true }
}
