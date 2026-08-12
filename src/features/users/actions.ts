'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/action-result'

import { inviteMember } from './invite'
import {
  createUserSchema,
  resendInvitationSchema,
  setUserActiveSchema,
  updateUserSchema,
} from './schemas'

/**
 * Alta y mantenimiento de administradores y vendedores.
 *
 * El alta en si —invitacion por correo + membresia bajo RLS— vive en
 * `./invite.ts`, compartida con el alta de integrantes de equipo
 * (`features/team/actions.ts`, BR-E04): no puede haber dos formas distintas de
 * crear un vendedor. Alli esta explicado el reparto de responsabilidades D-045.
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

  // Cada invitacion envia un correo y consume cuota de Auth. Se limita por
  // ORGANIZACION, no por quien invita: si no, bastaria con alternar entre dos
  // administradores para duplicar el cupo (D-062).
  const rate = checkRateLimit(
    `invitation:${auth.membership.organizationId}`,
    RATE_LIMITS.invitation,
  )
  if (!rate.allowed) {
    return { error: rate.message }
  }

  const result = await inviteMember({
    organizationId: auth.membership.organizationId,
    invitedBy: auth.membership.profileId,
    role: values.role,
    values,
  })
  if ('error' in result) return result

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
    return { error: 'Usuario no válido.' }
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

  // Reenviar tambien envia correo: comparte cupo con las invitaciones nuevas.
  const rate = checkRateLimit(
    `invitation:${auth.membership.organizationId}`,
    RATE_LIMITS.invitation,
  )
  if (!rate.allowed) {
    return { error: rate.message }
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.resetPasswordForEmail(member.profile.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  })

  if (error) return { error: mapPgError(error) }

  return { ok: true }
}
