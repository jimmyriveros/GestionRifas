'use server'

import { revalidatePath } from 'next/cache'

import { authorizeCapability } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

import { saveCommissionTemplateSchema, setSellerAgreementSchema } from './schemas'
import { toDbTiers } from './tiers'

/**
 * La configuracion de ganancias del personal (D-237).
 *
 * ESTAS ACCIONES NO DECIDEN NADA DE FONDO. Comprueban la sesion, la capacidad
 * `sellers.earnings.manage` y la forma de lo que llega; quien valida la lista,
 * la compatibilidad con el equipo y las rebajas, y quien recalcula, es la base:
 * `save_commission_template` y `staff_set_seller_agreement` corren en UNA
 * transaccion, y si algo falla no queda nada a medias.
 *
 * LA RESPUESTA DICE LO QUE PASO: `changed` distingue un guardado de verdad de
 * uno que no cambio nada —repetir el envio o un doble clic no crean versiones
 * ni recalculan (BR-G29, BR-G31)—, y la pantalla lo cuenta con palabras.
 */

type SaveTemplateResult =
  | { ok: true; changed: boolean; version: number }
  | { error: string }

const DENIED_TEMPLATE = 'No tienes permiso para cambiar la lista general de tramos.'
const DENIED_AGREEMENT = 'No tienes permiso para cambiar cómo se le paga a este vendedor.'

export async function saveCommissionTemplate(input: unknown): Promise<SaveTemplateResult> {
  const auth = await authorizeCapability('sellers.earnings.manage', {
    roles: ['owner', 'admin'],
    deniedMessage: DENIED_TEMPLATE,
  })
  if ('error' in auth) return auth

  const parsed = saveCommissionTemplateSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los tramos.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('save_commission_template', {
      p_organization_id: auth.membership.organizationId,
      p_tiers: toDbTiers(parsed.data.tiers),
    })
    .single()

  if (error || !data) return { error: mapPgError(error) }

  // Guardar la lista general no recalcula a nadie: solo cambian las pantallas
  // que la ENSEÑAN —la propia, el alta y «Mi equipo»—.
  revalidatePath('/owner/settings')
  revalidatePath('/owner/settings/earnings')
  revalidatePath('/owner/sellers')
  revalidatePath('/seller/team')

  return { ok: true, changed: data.changed, version: data.template_version }
}

type SetAgreementResult = { ok: true; changed: boolean; raffles: number } | { error: string }

export async function setSellerAgreement(input: unknown): Promise<SetAgreementResult> {
  const auth = await authorizeCapability('sellers.earnings.manage', {
    roles: ['owner', 'admin'],
    deniedMessage: DENIED_AGREEMENT,
  })
  if ('error' in auth) return auth

  const parsed = setSellerAgreementSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('staff_set_seller_agreement', {
      p_seller_id: values.sellerId,
      p_mode: values.commissionModel,
      // `undefined` y no `null`: es pedir el `default null` de la funcion.
      p_fixed_amount:
        values.commissionModel === 'fixed_per_ticket'
          ? (values.fixedCommissionAmount ?? undefined)
          : undefined,
      p_tiers:
        values.commissionModel === 'tiered' && values.customTiers
          ? toDbTiers(values.customTiers)
          : undefined,
    })
    .single()

  if (error || !data) return { error: mapPgError(error) }

  // El recalculo ya ocurrio en la misma transaccion. Cambia lo que ve el
  // personal en la ficha y lo que ven el vendedor y su padre en sus paneles;
  // las paginas del vendedor se leen en cada visita, asi que basta con la
  // ficha y los listados del personal.
  revalidatePath('/owner/sellers')
  revalidatePath(`/owner/sellers/${values.sellerId}`)

  return { ok: true, changed: data.changed, raffles: data.raffles_recalculated }
}
