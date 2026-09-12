'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from '@/lib/action-result'
import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

import {
  accountIdSchema,
  paymentAccountSchema,
  reorderAccountsSchema,
  updateAccountSchema,
} from './schemas'

/**
 * Las cinco escrituras de las cuentas para recibir pagos (BR-M02..BR-M08).
 *
 * SOLO EL PROPIO VENDEDOR, Y SOBRE LO SUYO. Ninguna accion recibe identificador
 * de vendedor, y las RPC de la `0051` tampoco: las dos sacan a la persona de la
 * sesion. No hay nada que manipular en la peticion para escribir la
 * configuracion de otro (BR-M02).
 *
 * POR QUE RPC Y NO `insert`/`update`. `seller_payment_accounts` concede **solo
 * `SELECT`** a `authenticated` y tiene una sola politica, tambien de `SELECT`:
 * un `insert` directo devuelve `42501`. Es deliberado —las RPC son la unica
 * puerta, asi que el tope de cinco, el orden y la bitacora no se pueden
 * esquivar— y por eso estas acciones no tienen alternativa.
 *
 * `revalidatePath` alcanza las dos pantallas que leen esto: la propia seccion y
 * la de recordatorios, cuya vista previa lleva las cuentas dentro (BR-S07).
 */

function revalidateSettings() {
  revalidatePath('/seller/settings')
  revalidatePath('/seller/settings/accounts')
  revalidatePath('/seller/settings/reminders')
}

/**
 * Los argumentos de tipo se OMITEN cuando no corresponden, en vez de mandarse
 * `null`: los tipos generados los declaran opcionales (`string | undefined`) y
 * la RPC los normaliza con `nullif(btrim(...), '')`. Una cuenta de Nequi no
 * manda banco, y el CHECK de la base lo exigiria igual.
 */
function accountArgs(values: {
  kind: 'nequi' | 'daviplata' | 'bank'
  holderName: string
  phone: string
  bankName: string
  accountType: 'savings' | 'checking' | null
  accountNumber: string
  label: string
}) {
  const label = values.label.trim()
  const common = {
    p_kind: values.kind,
    p_holder_name: values.holderName,
    ...(label === '' ? {} : { p_label: label }),
  }

  if (values.kind === 'bank') {
    return {
      ...common,
      p_bank_name: values.bankName,
      ...(values.accountType === null ? {} : { p_account_type: values.accountType }),
      p_account_number: values.accountNumber,
    }
  }
  return { ...common, p_phone: values.phone }
}

export async function createPaymentAccount(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = paymentAccountSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_seller_payment_account', accountArgs(parsed.data))
  if (error) return { error: mapPgError(error) }

  revalidateSettings()
  return { ok: true }
}

export async function updatePaymentAccount(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = updateAccountSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  // El TIPO no se cambia: un Nequi que pasa a ser cuenta bancaria es otra
  // cuenta. La RPC no lo recibe, y por eso tampoco viaja aqui.
  const { accountId, ...values } = parsed.data
  const { p_kind: _kind, ...args } = accountArgs(values)
  const { error } = await supabase.rpc('update_seller_payment_account', {
    p_id: accountId,
    ...args,
  })
  if (error) return { error: mapPgError(error) }

  revalidateSettings()
  return { ok: true }
}

export async function archivePaymentAccount(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = accountIdSchema.safeParse(input)
  if (!parsed.success) return { error: 'Cuenta no válida.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('archive_seller_payment_account', {
    p_id: parsed.data.accountId,
  })
  if (error) return { error: mapPgError(error) }

  revalidateSettings()
  return { ok: true }
}

export async function restorePaymentAccount(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = accountIdSchema.safeParse(input)
  if (!parsed.success) return { error: 'Cuenta no válida.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('restore_seller_payment_account', {
    p_id: parsed.data.accountId,
  })
  if (error) return { error: mapPgError(error) }

  revalidateSettings()
  return { ok: true }
}

/**
 * Reordenar manda la lista COMPLETA de cuentas activas, no un movimiento.
 *
 * Es lo que espera la RPC —comprueba que el conjunto sea exactamente el de las
 * cuentas activas de quien llama, sin repetidos y sin ajenas— y lo que hace que
 * «Subir» y «Bajar» sean idempotentes: dos pulsaciones seguidas producen el
 * orden que se ve, no un desplazamiento acumulado sobre un estado que pudo
 * cambiar en otra pestaña.
 */
export async function reorderPaymentAccounts(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['seller'])
  if ('error' in auth) return auth

  const parsed = reorderAccountsSchema.safeParse(input)
  if (!parsed.success) return { error: 'No pudimos guardar el orden.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reorder_seller_payment_accounts', {
    p_ids: parsed.data.accountIds,
  })
  if (error) return { error: mapPgError(error) }

  revalidateSettings()
  return { ok: true }
}
