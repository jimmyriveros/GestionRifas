'use server'

import { revalidatePath } from 'next/cache'

import { authorizeAction } from '@/lib/auth/guards'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import type { ActionResultWith } from '@/lib/action-result'

import { createPaymentSchema, updatePaymentAllocationSchema } from './schemas'

/**
 * Server Actions de pagos.
 *
 * TODA la logica financiera vive en las RPC `create_payment` y
 * `update_payment_allocation`. Son atomicas por construccion (una funcion
 * PL/pgSQL es una transaccion), bloquean las filas en orden para que dos
 * abonos simultaneos no puedan sobrepasar el precio, validan el cuadre exacto
 * y auditan.
 *
 * Aqui no se suma, no se resta y no se decide ningun estado: eso seria
 * reimplementar el nucleo del negocio en TypeScript, justo lo que `CLAUDE.md`
 * 29 prohibe («evitar calculos financieros unicamente en frontend»).
 *
 * SOLO EL VENDEDOR, desde D-198. Los abonos son de su cartera (BR-Q01): el
 * personal ya no los registra, no los corrige y no los anula, y las dos RPC le
 * responden lo mismo que ante un pago ajeno. `void_payment` sigue existiendo,
 * pero solo lo ejecuta `service_role`: por eso aqui ya no hay accion de anular.
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
  // El portal administrativo no ensena ningun abono, pero si el estado de pago
  // en dos valores y sus recuentos (BR-Q04): el abono que completa el precio
  // pasa una boleta de «Sin pagar» a «Pagada».
  revalidatePath('/owner/dashboard')
  revalidatePath('/owner/tickets')
  revalidatePath('/owner/tickets/[ticketId]', 'page')
  for (const ticketId of ticketIds) {
    revalidatePath(`/seller/tickets/${ticketId}`)
    revalidatePath(`/owner/tickets/${ticketId}`)
  }
  if (clientId) {
    revalidatePath(`/seller/clients/${clientId}`)
  }
}

export async function createPayment(input: unknown): Promise<ActionResultWith<{ id: string }>> {
  // BR-F02: el vendedor registra los pagos de sus clientes, y desde D-198 es el
  // unico. Quien no sea vendedor de la organizacion no llega ni a la RPC.
  const auth = await authorizeAction(['seller'])
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
 * Corregir el valor de un abono activo (BR-F16, D-134).
 *
 * Solo el vendedor dueno del cliente (D-198). La RPC lo vuelve a comprobar: no
 * basta con ocultar el boton. Un pago anulado no se toca (BR-F15). Aqui no se
 * suma ni se decide estado: `update_payment_allocation` escribe el importe y
 * los disparadores vigentes recalculan saldo, estado y ganancia.
 */
export async function updatePaymentAllocation(
  input: unknown,
): Promise<ActionResultWith<{ id: string }>> {
  const auth = await authorizeAction(['seller'])
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
