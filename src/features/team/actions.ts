'use server'

import { revalidatePath } from 'next/cache'

import { inviteMember, sendInvitation } from '@/features/users/invite'
import { userFormSchema } from '@/features/users/schemas'
import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/action-result'

import { deleteTeamMemberSchema, updateTeamMemberSchema } from './schemas'

/**
 * Alta de un integrante de equipo, hecha por el propio vendedor (BR-E04).
 *
 * Reutiliza pieza por pieza el alta que ya existia: el mismo esquema de Zod que
 * el formulario del portal administrativo, la misma invitacion por correo y la
 * misma compensacion si la membresia falla (`features/users/invite.ts`). Lo
 * unico propio es quien puede llamarla y con que vendedor padre.
 *
 * Quien decide de verdad es la politica `memberships_insert_seller` (0022): rol
 * `seller`, padre igual a quien llama y quien llama sin padre propio. Esta
 * accion no puede saltarsela porque inserta con el cliente de la SESION, no con
 * la service role.
 */
export async function createTeamMember(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = userFormSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  // DOS limites, porque protegen cosas distintas. El del vendedor evita que uno
  // solo agote de golpe el cupo de toda la organizacion —hasta esta version
  // ningun vendedor podia provocar el envio de un correo—; el de la
  // organizacion protege el recurso escaso de verdad, la cuota de Auth, y es el
  // mismo contador que usan las invitaciones del personal (D-062).
  const own = checkRateLimit(
    `team-invitation:${auth.membership.profileId}`,
    RATE_LIMITS.teamInvitation,
  )
  if (!own.allowed) return { error: own.message }

  const org = checkRateLimit(`invitation:${auth.membership.organizationId}`, RATE_LIMITS.invitation)
  if (!org.allowed) return { error: org.message }

  const result = await inviteMember({
    organizationId: auth.membership.organizationId,
    invitedBy: auth.membership.profileId,
    role: 'seller',
    values,
    parentSellerId: auth.membership.profileId,
  })
  if ('error' in result) return result

  revalidatePath('/seller/team')
  revalidatePath('/seller/dashboard')
  return { ok: true }
}

function refreshTeam(memberId: string): void {
  revalidatePath('/seller/team')
  revalidatePath(`/seller/team/${memberId}`)
  revalidatePath('/seller/dashboard')
}

/**
 * Corregir los datos de un integrante (BR-E15, BR-E16).
 *
 * Nombre, alias y celular son siempre editables. El correo, solo mientras la
 * invitacion siga pendiente, y corregirlo obliga a rehacer la invitacion entera.
 *
 * QUIEN DECIDE QUE
 *
 * Esta accion no decide nada de fondo. `team_update_member` corre con la sesion
 * de quien llama y es la que comprueba que el integrante sea de SU equipo y que
 * la cuenta siga sin activarse; si no, levanta un error. Lo que hace esta
 * accion es lo unico que la base de datos no puede hacer: hablar con Auth, que
 * es la fuente de verdad del correo (0001).
 *
 * EL ORDEN IMPORTA, Y SU DESHACER TAMBIEN
 *
 *   1. Cambiar el correo en Auth. `sync_profile_email` lo copia al perfil.
 *   2. Volver a invitar a la direccion nueva. Como la cuenta sigue sin
 *      confirmar, Auth reescribe el token en la misma ranura y el enlace
 *      anterior deja de funcionar solo: nunca hay dos invitaciones validas
 *      (D-097, comprobado en BD E2-10).
 *   3. Anotarlo en la bitacora, cuando ya ocurrio.
 *
 * Si el paso 2 o el 3 fallan, el correo vuelve al anterior. La alternativa
 * —dejarlo cambiado sin invitacion valida— seria una cuenta a la que nadie
 * puede entrar y que nadie puede reparar, porque su correo ya no seria el que
 * el vendedor padre recuerda.
 *
 * Deshacer no deja ningun enlace suelto, y esto se comprobo: el unico caso en
 * que el paso 3 falla por si solo es que la persona haya configurado su
 * contrasena en ese instante, y confirmar una cuenta INVALIDA su token
 * pendiente. La invitacion que acababa de salir a la direccion nueva ya no
 * sirve para nada.
 */
export async function updateTeamMember(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = updateTeamMemberSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('team_update_member', {
      p_member_id: values.memberId,
      p_full_name: values.fullName,
      p_alias: values.alias,
      p_phone: values.phone,
      p_email: values.email,
    })
    .single()

  if (error) return { error: mapPgError(error) }

  if (!data?.rotate_invitation) {
    refreshTeam(values.memberId)
    return { ok: true }
  }

  // Desde aqui hay correo nuevo, y eso significa enviar uno: mismo cupo que
  // cualquier otra invitacion (D-062).
  const previousEmail = data.previous_email
  const own = checkRateLimit(
    `team-invitation:${auth.membership.profileId}`,
    RATE_LIMITS.teamInvitation,
  )
  if (!own.allowed) return { error: own.message }

  const org = checkRateLimit(`invitation:${auth.membership.organizationId}`, RATE_LIMITS.invitation)
  if (!org.allowed) return { error: org.message }

  const admin = createAdminClient()
  const { error: authError } = await admin.auth.admin.updateUserById(values.memberId, {
    email: values.email,
  })
  if (authError) return { error: mapPgError(authError) }

  const restoreEmail = async () => {
    await admin.auth.admin.updateUserById(values.memberId, { email: previousEmail })
  }

  const invited = await sendInvitation(values.email, {
    full_name: values.fullName,
    alias: values.alias === '' ? null : values.alias,
    phone: values.phone,
  })
  if ('error' in invited) {
    await restoreEmail()
    return { error: invited.error }
  }

  const { error: auditError } = await supabase.rpc('team_confirm_email_change', {
    p_member_id: values.memberId,
    p_previous_email: previousEmail,
    p_new_email: values.email,
  })
  if (auditError) {
    await restoreEmail()
    return { error: mapPgError(auditError) }
  }

  refreshTeam(values.memberId)
  return { ok: true }
}

/**
 * Borrar un alta equivocada (BR-E17, BR-E18).
 *
 * Solo mientras la invitacion siga pendiente. Quien ya activo su cuenta se
 * DESACTIVA, y eso sigue siendo del personal (BR-U06, D-038): son dos cosas
 * distintas y el glosario no las mezcla.
 *
 * `team_delete_member` borra la membresia y comprueba todo lo que hay que
 * comprobar. Despues se borra la cuenta de Auth, y con ella se van en cascada
 * el perfil y cualquier invitacion pendiente: no queda enlace que alguien pueda
 * usar mas tarde.
 */
export async function deleteTeamMember(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = deleteTeamMemberSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Vendedor no válido.' }
  }
  const { memberId } = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('team_delete_member', { p_member_id: memberId })
  if (error) return { error: mapPgError(error) }

  const admin = createAdminClient()
  const { error: authError } = await admin.auth.admin.deleteUser(memberId)

  refreshTeam(memberId)

  if (authError) {
    // Ya no esta en el equipo y su invitacion no sirve para entrar a ninguna
    // parte —sin membresia no hay acceso—, pero la cuenta quedo suelta en Auth.
    // Se dice, en vez de dar por terminado algo que quedo a medias.
    return {
      error:
        'Sacamos a esta persona de tu equipo, pero no pudimos borrar su cuenta del todo. Avísale a un administrador.',
    }
  }

  return { ok: true }
}
