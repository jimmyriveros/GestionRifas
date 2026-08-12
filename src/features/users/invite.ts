import 'server-only'

import { mapPgError } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/action-result'

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
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? ''
}

export async function inviteMember(input: InviteMemberInput): Promise<ActionResult> {
  const { organizationId, invitedBy, role, values, parentSellerId } = input

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
    organization_id: organizationId,
    profile_id: profileId,
    role,
    invited_by: invitedBy,
    parent_seller_id: parentSellerId ?? null,
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
