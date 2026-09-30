'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from '@/lib/action-result'
import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

import {
  confirmCloseSchema,
  recordPrizePaymentSchema,
  recordTransferSchema,
  voidPrizePaymentSchema,
  voidTransferSchema,
} from './schemas'

/**
 * Server Actions del cierre de cuentas (D-241).
 *
 * AQUI NO SE DECIDE NADA DE DINERO. Quien confirma, cuanto cabe, si el saldo
 * cambio, si la cuenta queda cerrada y si un premio ya tiene pago lo decide la
 * RPC, dentro de una transaccion y con el cerrojo de la cuenta tomado
 * (BR-Z05..BR-Z12). La accion comprueba que haya una sesion activa, valida la
 * forma de lo que llega y traduce la respuesta.
 *
 * LAS TRES AUDIENCIAS LLAMAN A LAS MISMAS ACCIONES: el personal confirma lo que
 * recibe de un vendedor directo, el vendedor a cargo lo que recibe de un
 * integrante y el vendedor una devolucion. Por eso la primera linea admite a
 * cualquier persona activa de la organizacion y la base dice quien puede —con
 * su propio mensaje—; una guarda por rol aqui solo duplicaria esa regla.
 */

const ANY_ROLE = ['owner', 'admin', 'seller'] as const

function revalidateSettlements() {
  revalidatePath('/owner/settlements')
  revalidatePath('/owner/settlements/[sellerId]', 'page')
  revalidatePath('/seller/settlement')
  revalidatePath('/seller/settlement/team/[memberId]', 'page')
}

export type RecordTransferResult =
  | { ok: true; outcome: 'recorded' | 'already_recorded'; closed: boolean }
  /** El saldo cambio mientras la persona revisaba: NO se guardo nada. */
  | { changed: { before: number; now: number } }
  | { error: string }

export async function recordSettlementTransfer(input: unknown): Promise<RecordTransferResult> {
  const auth = await authorizeAction(ANY_ROLE)
  if ('error' in auth) return auth

  const parsed = recordTransferSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('settlement_record_transfer', {
    p_raffle_id: values.raffleId,
    p_seller_id: values.sellerId,
    p_kind: values.kind,
    p_amount: values.amount,
    p_received_on: values.receivedOn,
    p_expected_balance: values.expectedBalance,
    p_request_id: values.requestId,
  })
  if (error) return { error: mapPgError(error) }

  const row = data?.[0]
  if (!row) return { error: 'Ocurrió un error. Intenta de nuevo.' }
  if (row.outcome === 'balance_changed') {
    return {
      changed: { before: values.expectedBalance, now: Number(row.current_balance ?? 0) },
    }
  }

  revalidateSettlements()
  return {
    ok: true,
    outcome: row.outcome === 'already_recorded' ? 'already_recorded' : 'recorded',
    closed: row.closed,
  }
}

export type RecordPrizePaymentResult =
  { ok: true; outcome: 'recorded' | 'already_recorded'; closed: boolean } | { error: string }

export async function recordSettlementPrizePayment(
  input: unknown,
): Promise<RecordPrizePaymentResult> {
  const auth = await authorizeAction(ANY_ROLE)
  if ('error' in auth) return auth

  const parsed = recordPrizePaymentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('settlement_record_prize_payment', {
    p_raffle_id: values.raffleId,
    p_match_id: values.matchId,
    p_prize_id: values.prizeId,
    p_payer: values.payer,
    p_payer_id: values.payerId,
    p_amount: values.amount,
    p_paid_on: values.paidOn,
    p_request_id: values.requestId,
  })
  if (error) return { error: mapPgError(error) }

  const row = data?.[0]
  if (!row) return { error: 'Ocurrió un error. Intenta de nuevo.' }

  revalidateSettlements()
  return {
    ok: true,
    outcome: row.outcome === 'already_recorded' ? 'already_recorded' : 'recorded',
    closed: row.closed,
  }
}

export async function voidSettlementTransfer(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(ANY_ROLE)
  if ('error' in auth) return auth

  const parsed = voidTransferSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('settlement_void_transfer', {
    p_transfer_id: parsed.data.transferId,
    p_reason: parsed.data.reason,
  })
  if (error) return { error: mapPgError(error) }

  revalidateSettlements()
  return { ok: true }
}

export async function voidSettlementPrizePayment(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(ANY_ROLE)
  if ('error' in auth) return auth

  const parsed = voidPrizePaymentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('settlement_void_prize_payment', {
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason,
  })
  if (error) return { error: mapPgError(error) }

  revalidateSettlements()
  return { ok: true }
}

export type ConfirmCloseResult =
  | { ok: true; outcome: 'closed' | 'already_closed' }
  /** La huella que la persona tenia a la vista ya no es la de hoy: no se cerro. */
  | { changed: true }
  | { error: string }

export async function confirmSettlementClose(input: unknown): Promise<ConfirmCloseResult> {
  const auth = await authorizeAction(ANY_ROLE)
  if ('error' in auth) return auth

  const parsed = confirmCloseSchema.safeParse(input)
  if (!parsed.success) return { error: 'Revisa los datos ingresados.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('settlement_confirm_close', {
    p_raffle_id: parsed.data.raffleId,
    p_seller_id: parsed.data.sellerId,
    p_fingerprint: parsed.data.fingerprint,
  })
  if (error) return { error: mapPgError(error) }

  if (data === 'changed') return { changed: true }
  revalidateSettlements()
  return { ok: true, outcome: data === 'already_closed' ? 'already_closed' : 'closed' }
}
