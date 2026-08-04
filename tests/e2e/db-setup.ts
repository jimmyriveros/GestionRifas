import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

import type { Database } from '../../src/types/database.types'

/**
 * PREPARACION de datos para las pruebas end-to-end, con la service role.
 *
 * Se usa unicamente para dejar la base en el estado de partida que la prueba
 * necesita (por ejemplo, una boleta pendiente de aprobacion, que hoy solo puede
 * crear el portal del vendedor, que llega en la Fase 4).
 *
 * El ACTO que se prueba siempre ocurre por la interfaz, con la sesion real del
 * usuario: si se usara la service role para eso, la prueba pasaria aunque no
 * existiera ninguna politica de seguridad (docs/TESTING.md, D-043).
 */

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export function serviceClient(): SupabaseClient<Database> {
  return createClient<Database>(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: WebSocket as any },
  })
}

export type SeedRefs = {
  organizationId: string
  raffleId: string
  ownerId: string
  sellerId: string
  otherSellerId: string
}

export async function loadSeedRefs(): Promise<SeedRefs> {
  const svc = serviceClient()

  const { data: org } = await svc
    .from('organizations')
    .select('id')
    .eq('name', 'Rifas Demo')
    .single()
  const { data: raffle } = await svc
    .from('raffles')
    .select('id')
    .eq('name', 'Rifa Navidad 2026')
    .single()
  const { data: profiles } = await svc.from('profiles').select('id, email')

  const byEmail = (email: string) => profiles!.find((p) => p.email === email)!.id

  return {
    organizationId: org!.id,
    raffleId: raffle!.id,
    ownerId: byEmail('owner@demo.test'),
    sellerId: byEmail('vendedor1@demo.test'),
    otherSellerId: byEmail('vendedor2@demo.test'),
  }
}

/** Un recurso que pertenece a OTRO vendedor, para probar el aislamiento. */
export async function findOtherSellerResources(
  refs: SeedRefs,
): Promise<{ ticketId: string | null; clientId: string | null }> {
  const svc = serviceClient()

  const [{ data: tickets }, { data: clients }] = await Promise.all([
    svc.from('tickets').select('id').eq('seller_id', refs.otherSellerId).limit(1),
    svc.from('clients').select('id').eq('seller_id', refs.otherSellerId).limit(1),
  ])

  return { ticketId: tickets?.[0]?.id ?? null, clientId: clients?.[0]?.id ?? null }
}

/** Crea un cliente para el vendedor 1 y devuelve su id y nombre. */
export async function createClientFor(
  refs: SeedRefs,
  name: string,
): Promise<{ id: string; name: string }> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('clients')
    .insert({
      organization_id: refs.organizationId,
      seller_id: refs.sellerId,
      name,
      phone: '3005550000',
    })
    .select('id, name')
    .single()

  if (error) throw error
  return data
}

/**
 * Boleta YA VENDIDA a un cliente, lista para recibir abonos.
 *
 * Se inserta directamente con la service role en vez de llamar a
 * `assign_ticket`: esa RPC necesita `auth.uid()`, que no existe con la clave de
 * servicio. Es PREPARACION del estado de partida; el acto que se prueba —el
 * registro del abono— pasa siempre por la interfaz (D-043).
 */
export async function createAssignedTicket(
  refs: SeedRefs,
  options: { dailyNumber: string; weeklyNumber: string; clientId: string; salePrice: number },
): Promise<{ id: string; internalCode: string }> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('tickets')
    .insert({
      organization_id: refs.organizationId,
      raffle_id: refs.raffleId,
      seller_id: refs.sellerId,
      client_id: options.clientId,
      daily_number: options.dailyNumber,
      weekly_number: options.weeklyNumber,
      inventory_status: 'assigned',
      sale_price: options.salePrice,
      sale_date: new Date().toISOString().slice(0, 10),
      assigned_at: new Date().toISOString(),
      created_by: refs.ownerId,
    })
    .select('id, internal_code')
    .single()

  if (error) throw error
  return { id: data.id, internalCode: data.internal_code }
}

/** Saldo pendiente actual de una boleta, leido de la vista de saldos. */
export async function ticketBalance(
  ticketId: string,
): Promise<{ paidAmount: number; pendingAmount: number; paymentStatus: string }> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('v_ticket_balances')
    .select('paid_amount, pending_amount, payment_status')
    .eq('ticket_id', ticketId)
    .single()

  if (error) throw error
  return {
    paidAmount: data.paid_amount ?? 0,
    pendingAmount: data.pending_amount ?? 0,
    paymentStatus: data.payment_status ?? 'unpaid',
  }
}

/** Precio vigente de la rifa del seed. */
export async function raffleTicketPrice(refs: SeedRefs): Promise<number> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('raffles')
    .select('ticket_price')
    .eq('id', refs.raffleId)
    .single()

  if (error) throw error
  return data.ticket_price
}

/** Crea una boleta en el estado indicado y devuelve su codigo interno. */
export async function createTicket(
  refs: SeedRefs,
  options: {
    dailyNumber: string
    weeklyNumber: string
    inventoryStatus: Database['public']['Enums']['ticket_inventory_status']
  },
): Promise<{ id: string; internalCode: string }> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('tickets')
    .insert({
      organization_id: refs.organizationId,
      raffle_id: refs.raffleId,
      seller_id: refs.sellerId,
      daily_number: options.dailyNumber,
      weekly_number: options.weeklyNumber,
      inventory_status: options.inventoryStatus,
      created_by: refs.sellerId,
    })
    .select('id, internal_code')
    .single()

  if (error) throw error
  return { id: data.id, internalCode: data.internal_code }
}

/**
 * Devuelve una membresia a su estado activo.
 *
 * Se usa para RESTITUIR el seed despues de una prueba que desactiva a alguien
 * (BR-A04). Va por la service role a proposito: si la restitucion dependiera de
 * la interfaz, un fallo o un timeout en mitad de la prueba dejaria al vendedor
 * inactivo y las DEMAS pruebas empezarian a fallar por un motivo que no tiene
 * nada que ver con ellas. Preparar y restituir estado es justo para lo que se
 * admite la service role (docs/TESTING.md §2.1).
 */
export async function setMembershipActive(email: string, isActive: boolean): Promise<void> {
  const svc = serviceClient()

  const { data: profile, error: profileError } = await svc
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single()
  if (profileError) throw profileError

  const { error } = await svc
    .from('memberships')
    .update({ is_active: isActive })
    .eq('profile_id', profile.id)
  if (error) throw error
}
