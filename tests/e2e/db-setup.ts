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
  }
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
