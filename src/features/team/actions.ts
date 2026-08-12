'use server'

import { revalidatePath } from 'next/cache'

import { inviteMember } from '@/features/users/invite'
import { userFormSchema } from '@/features/users/schemas'
import { authorizeAction } from '@/lib/auth/guards'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import type { ActionResult } from '@/lib/action-result'

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
