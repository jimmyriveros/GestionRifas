'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult, ActionResultWith } from '@/lib/action-result'

import { createPaymentSchema, updatePaymentAllocationSchema, voidPaymentSchema } from './schemas'

/**
 * Server Actions de pagos.
 *
 * TODA la logica financiera vive en las RPC `create_payment`, `void_payment`
 * y `update_payment_allocation`. Son atomicas por construccion (una funcion
 * PL/pgSQL es una transaccion), bloquean las filas en orden para que dos
 * abonos simultaneos no puedan sobrepasar el precio, validan el cuadre exacto
 * y auditan.
 *
 * Aqui no se suma, no se resta y no se decide ningun estado: eso seria
 * reimplementar el nucleo del negocio en TypeScript, justo lo que `CLAUDE.md`
 * 29 prohibe («evitar calculos financieros unicamente en frontend»).
 */

function revalidatePayments(clientId?: string, ticketIds: readonly string[] = []) {
  revalidatePath('/seller/payments')
  revalidatePath('/seller/dashboard')
  revalidatePath('/seller/tickets')
  // El DETALLE de una boleta tambien cambia con cada abono: abonado, saldo
  // pendiente, estado de pago e historial. Revalidar `/seller/tickets` NO
  // alcanza a sus segmentos dinamicos, asi que hay que nombrar el patron con
  // `'page'`, igual que ya hace la asignacion (`tickets/assign/actions.ts`).
  // Las rutas literales de las boletas tocadas cubren el detalle concreto al
  // que se vuelve (D-133); el patron cubre el resto.
  revalidatePath('/seller/tickets/[ticketId]', 'page')
  revalidatePath('/owner/payments')
  revalidatePath('/owner/dashboard')
  revalidatePath('/owner/tickets')
  revalidatePath('/owner/tickets/[ticketId]', 'page')
  for (const ticketId of ticketIds) {
    revalidatePath(`/seller/tickets/${ticketId}`)
    revalidatePath(`/owner/tickets/${ticketId}`)
  }
  if (clientId) {
    revalidatePath(`/seller/clients/${clientId}`)
    revalidatePath(`/owner/clients/${clientId}`)
  }
}

export async function createPayment(input: unknown): Promise<ActionResultWith<{ id: string }>> {
  // BR-F02: el vendedor registra los pagos de sus clientes; el personal tambien
  // puede hacerlo. Quien NO sea de la organizacion no llega ni aqui.
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = createPaymentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_payment', {
    p_client_id: values.clientId,
    p_total_amount: values.totalAmount,
    p_allocations: values.allocations.map((allocation) => ({
      ticket_id: allocation.ticketId,
      amount: allocation.amount,
    })),
    p_payment_date: values.paymentDate,
    p_payment_method: values.paymentMethod,
    p_notes: values.notes === '' ? undefined : values.notes,
  })

  if (error) return { error: mapPgError(error) }

  revalidatePayments(
    values.clientId,
    values.allocations.map((allocation) => allocation.ticketId),
  )
  return { ok: true, data: { id: data as string } }
}

/**
 * Anulacion de un pago (BR-F09, BR-F10, BR-F11).
 *
 * Solo Owner y Admin: la RPC lo comprueba con `is_org_staff` y devuelve 42501
 * si lo intenta un vendedor. El pago no se borra nunca; se marca, y el trigger
 * de la Fase 2 recalcula el saldo de todas las boletas afectadas.
 */
export async function voidPayment(input: unknown): Promise<ActionResult> {
  const auth = await authorizeAction(['owner', 'admin'])
  if ('error' in auth) return auth

  const parsed = voidPaymentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa el motivo.' }
  }

  const supabase = await createClient()

  // Solo para poder revalidar el perfil del cliente afectado.
  const { data: payment } = await supabase
    .from('payments')
    .select('client_id')
    .eq('id', parsed.data.paymentId)
    .maybeSingle()

  const { error } = await supabase.rpc('void_payment', {
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason,
  })

  if (error) return { error: mapPgError(error) }

  revalidatePayments(payment?.client_id ?? undefined)
  return { ok: true }
}

/**
 * Corregir el valor de un abono activo (BR-F16, D-134).
 *
 * El vendedor dueno del cliente y el personal pueden. La RPC lo vuelve a
 * comprobar: no basta con ocultar el boton. Un pago anulado no se toca
 * (BR-F15). Aqui no se suma ni se decide estado: `update_payment_allocation`
 * escribe el importe y los disparadores vigentes recalculan saldo, estado y
 * ganancia.
 */
export async function updatePaymentAllocation(
  input: unknown,
): Promise<ActionResultWith<{ id: string }>> {
  const auth = await authorizeAction(['owner', 'admin', 'seller'])
  if ('error' in auth) return auth

  const parsed = updatePaymentAllocationSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' }
  }
  const values = parsed.data

  const supabase = await createClient()

  const { data: payment } = await supabase
    .from('payments')
    .select('client_id')
    .eq('id', values.paymentId)
    .maybeSingle()

  const { data, error } = await supabase.rpc('update_payment_allocation', {
    p_payment_id: values.paymentId,
    p_ticket_id: values.ticketId,
    p_amount: values.amount,
    p_expected_amount: values.expectedAmount,
  })

  if (error) return { error: mapPgError(error) }

  revalidatePayments(payment?.client_id ?? undefined, [values.ticketId])
  return { ok: true, data: { id: data as string } }
}
