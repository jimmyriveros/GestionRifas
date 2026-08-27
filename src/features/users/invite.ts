import 'server-only'

import { mapPgError } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/action-result'

import type { CommissionModel } from '@/lib/constants'

import type { ManageableRole, UserFormInput } from './schemas'

/**
 * Alta de una persona en la organizacion: invitacion por correo + membresia.
 *
 * Vive aparte de `actions.ts` porque lo usan DOS acciones —el alta que hace el
 * personal (`createUser`) y el alta de un integrante de equipo que hace un
 * vendedor (`createTeamMember`, BR-E04)— y el encargo era explicito: no puede
 * haber dos implementaciones distintas para crear un vendedor. Si algun dia
 * cambia el correo de invitacion, la compensacion o el destino del enlace,
 * cambia aqui y las dos altas se enteran.
 *
 * No es un archivo `'use server'` a proposito: si lo fuera, exportar esta
 * funcion la volveria invocable desde el navegador con los argumentos que
 * quisiera quien llamara —incluido `organizationId`—. Aqui es una funcion de
 * servidor normal, y quien decide esos argumentos es la Server Action que ya
 * comprobo sesion, rol y organizacion.
 *
 * Reparto de responsabilidades (D-045), inalterado:
 *   * La cuenta de Auth se crea con la SERVICE ROLE, porque `auth.admin` no
 *     existe de otra forma. Solo toca `auth`, jamas datos de negocio.
 *   * La MEMBRESIA se inserta con el cliente de sesion, sujeto a RLS: son las
 *     politicas `memberships_insert_staff` y `memberships_insert_seller` las que
 *     deciden quien puede crear a quien, no una comprobacion de TypeScript.
 */

type InviteMemberInput = {
  organizationId: string
  /** Quien invita. Queda en `invited_by`. */
  invitedBy: string
  role: ManageableRole
  values: UserFormInput
  /**
   * Solo para equipos: deja al vendedor nuevo colgado de quien lo crea
   * (BR-E01). Sin este dato, la membresia nace a cargo del Dueño.
   */
  parentSellerId?: string
  /**
   * Solo para equipos: como se le va a pagar (BR-G24). Sin este dato la
   * membresia nace con el default de la columna —`tiered` sin importe—, que es
   * lo que corresponde a un vendedor dado de alta por el personal.
   */
  commission?: { model: CommissionModel; amount: number | null }
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? ''
}

/** Los datos que la invitacion deja en Auth para que el trigger arme el perfil. */
type InvitationMetadata = {
  full_name: string
  alias: string | null
  phone: string
}

/**
 * El envio de la invitacion, aislado porque lo usan DOS momentos distintos: el
 * alta y la CORRECCION del correo de una invitacion pendiente (BR-E16).
 *
 * Que la correccion pase por aqui no es solo higiene. Volver a invitar a una
 * cuenta sin confirmar reescribe el token en la misma ranura de Auth, de modo
 * que el enlace anterior deja de servir en el acto: es Auth quien garantiza que
 * nunca haya dos invitaciones validas a la vez, no una limpieza nuestra
 * (D-097). Si esta llamada cambiara, esa garantia cambiaria con ella.
 */
export async function sendInvitation(
  email: string,
  metadata: InvitationMetadata,
): Promise<{ profileId: string } | { error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  })

  if (error || !data?.user) {
    return { error: mapPgError(error) }
  }

  return { profileId: data.user.id }
}

export async function inviteMember(input: InviteMemberInput): Promise<ActionResult> {
  const { organizationId, invitedBy, role, values, parentSellerId, commission } = input

  const invited = await sendInvitation(values.email, {
    full_name: values.fullName,
    alias: values.alias === '' ? null : values.alias,
    phone: values.phone,
  })
  if ('error' in invited) return invited

  const admin = createAdminClient()
  const profileId = invited.profileId

  const supabase = await createClient()
  const { error: membershipError } = await supabase.from('memberships').insert({
    organization_id: organizationId,
    profile_id: profileId,
    role,
    invited_by: invitedBy,
    parent_seller_id: parentSellerId ?? null,
    // Sin `commission` se omiten las dos columnas y la fila toma el default de
    // la migracion 0031: `tiered` sin importe, que es el comportamiento de
    // siempre para un vendedor dado de alta por el personal.
    ...(commission
      ? {
          commission_model: commission.model,
          fixed_commission_amount: commission.amount,
        }
      : {}),
  })

  if (membershipError) {
    // Compensacion: sin membresia la cuenta no sirve para nada y dejaria un
    // correo bloqueado para siempre. Se elimina la cuenta recien creada para
    // que el alta pueda reintentarse.
    await admin.auth.admin.deleteUser(profileId)
    return { error: mapPgError(membershipError) }
  }

  return { ok: true }
}
