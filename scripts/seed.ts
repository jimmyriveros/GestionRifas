/**
 * Datos de desarrollo completos.
 *
 *   npm run seed            -> contra el proyecto de .env.local
 *   npm run seed:local      -> contra la instancia local (npx supabase start)
 *
 * Crea:
 *   - Organizacion "Rifas Demo": Owner, Admin, 2 vendedores, una rifa activa de
 *     $120.000, clientes, boletas en todos los estados y pagos parciales,
 *     completos, repartidos y anulados. Los cuatro escenarios de pago que hay
 *     que poder ver en pantalla (D-098):
 *
 *       Sin pagar   $0        de $120.000
 *       Abonada     $40.000   de $120.000  -> faltan $80.000
 *       Abonada     $100.000  de $120.000  -> faltan $20.000  (caso critico:
 *                   el importe que ANTES dejaba la boleta Pagada)
 *       Pagada      $120.000  de $120.000  -> saldo $0
 *   - Organizacion "Rifas Control": Owner y vendedor propios, con una rifa cuyas
 *     boletas REUTILIZAN combinaciones de la primera organizacion. Existe para
 *     que las pruebas puedan demostrar dos cosas a la vez: que la unicidad de
 *     numeros es por rifa (BR-N06) y que ninguna organizacion ve datos de la
 *     otra (BR-O02).
 *
 * Las asignaciones y los pagos se hacen iniciando sesion como el vendedor real
 * y llamando a las RPC (assign_ticket, create_payment): asi el seed recorre el
 * mismo camino que la aplicacion y no puede producir datos que la aplicacion no
 * podria haber producido.
 *
 * Idempotente: si la rifa demo ya existe, no vuelve a crear datos de negocio.
 * Nunca contiene contrasenas reales (ver scripts/supabase-target.ts).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

import { resolveTarget } from './supabase-target'
import type { Database } from '../src/types/database.types'

const target = resolveTarget()

// Node 20 no trae WebSocket nativo; @supabase/realtime-js lo exige aunque no se
// use realtime (D-033).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const realtime = { transport: WebSocket as any }

const admin = createClient<Database>(target.url, target.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime,
})

type AppRole = Database['public']['Enums']['app_role']
type SeedUser = { email: string; fullName: string; phone: string; role: AppRole }

const ORG_DEMO = 'Rifas Demo'
const ORG_CONTROL = 'Rifas Control'
const RAFFLE_DEMO = 'Rifa Navidad 2026'
const RAFFLE_CONTROL = 'Rifa Control 2026'

const DEMO_USERS: SeedUser[] = [
  { email: 'owner@demo.test', fullName: 'Camila Restrepo', phone: '3001234567', role: 'owner' },
  { email: 'admin@demo.test', fullName: 'Andres Gomez', phone: '3002345678', role: 'admin' },
  { email: 'vendedor1@demo.test', fullName: 'Julian Vargas', phone: '3003456789', role: 'seller' },
  { email: 'vendedor2@demo.test', fullName: 'Laura Moreno', phone: '3004567890', role: 'seller' },
]

const CONTROL_USERS: SeedUser[] = [
  { email: 'owner@control.test', fullName: 'Patricia Londono', phone: '3011111111', role: 'owner' },
  { email: 'vendedor@control.test', fullName: 'Mateo Suarez', phone: '3012222222', role: 'seller' },
]

// ---------------------------------------------------------------------------
// Usuarios y organizaciones
// ---------------------------------------------------------------------------

async function findUserIdByEmail(email: string): Promise<string | null> {
  let page = 1
  const perPage = 200
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (match) return match.id
    if (data.users.length < perPage) return null
    page += 1
  }
}

/**
 * auth.admin.createUser({ password }) deja la contrasena en un estado que
 * rechaza el primer signInWithPassword; un updateUserById posterior con la
 * misma contrasena si funciona (D-035, I-007). Por eso siempre se confirma.
 */
async function ensureAuthUser(user: SeedUser): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: target.seedPassword,
    email_confirm: true,
    user_metadata: { full_name: user.fullName, phone: user.phone },
  })

  let profileId: string
  if (!error && data.user) {
    profileId = data.user.id
    console.log(`  creado: ${user.email}`)
  } else {
    const alreadyExists = /already|existe|registered/i.test(error?.message ?? '')
    if (!alreadyExists) throw error ?? new Error(`No se pudo crear ${user.email}`)
    const existingId = await findUserIdByEmail(user.email)
    if (!existingId) throw new Error(`${user.email} reporta duplicado pero no se encontro`)
    profileId = existingId
    console.log(`  ya existia: ${user.email}`)
  }

  const { error: pwError } = await admin.auth.admin.updateUserById(profileId, {
    password: target.seedPassword,
  })
  if (pwError) throw pwError

  return profileId
}

async function ensureOrganization(name: string): Promise<string> {
  const { data: existing, error: selectError } = await admin
    .from('organizations')
    .select('id')
    .eq('name', name)
    .maybeSingle()
  if (selectError) throw selectError
  if (existing) {
    console.log(`  organizacion ya existia: ${name}`)
    return existing.id
  }

  const { data: created, error } = await admin
    .from('organizations')
    .insert({ name })
    .select('id')
    .single()
  if (error) throw error
  console.log(`  organizacion creada: ${name}`)
  return created.id
}

async function ensureMembership(orgId: string, profileId: string, role: AppRole) {
  const { error } = await admin
    .from('memberships')
    .upsert(
      { organization_id: orgId, profile_id: profileId, role, is_active: true },
      { onConflict: 'organization_id,profile_id' },
    )
  if (error) throw error
}

async function seedUsersAndOrgs(orgName: string, users: SeedUser[]) {
  const orgId = await ensureOrganization(orgName)
  const ids: Record<string, string> = {}
  for (const user of users) {
    const profileId = await ensureAuthUser(user)
    await ensureMembership(orgId, profileId, user.role)
    ids[user.email] = profileId
  }
  return { orgId, ids }
}

// ---------------------------------------------------------------------------
// Datos de negocio
// ---------------------------------------------------------------------------

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function raffleExists(orgId: string, name: string): Promise<boolean> {
  const { data, error } = await admin
    .from('raffles')
    .select('id')
    .eq('organization_id', orgId)
    .eq('name', name)
    .maybeSingle()
  if (error) throw error
  return data !== null
}

async function createRaffle(
  orgId: string,
  createdBy: string,
  name: string,
  ticketPrice: number,
  allowSellerCreation: boolean,
): Promise<string> {
  const { data, error } = await admin
    .from('raffles')
    .insert({
      organization_id: orgId,
      name,
      description: `Rifa de desarrollo generada por el seed (${name}).`,
      ticket_price: ticketPrice,
      start_date: isoDate(-7),
      end_date: isoDate(90),
      status: 'active',
      allow_seller_ticket_creation: allowSellerCreation,
      created_by: createdBy,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function createClientRow(
  orgId: string,
  sellerId: string,
  name: string,
  phone: string,
  email: string | null,
): Promise<string> {
  const { data, error } = await admin
    .from('clients')
    .insert({ organization_id: orgId, seller_id: sellerId, name, phone, email })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

type TicketSpec = {
  daily: string | null
  weekly: string | null
  status: 'available' | 'draft' | 'pending_approval'
}

async function createTickets(
  orgId: string,
  raffleId: string,
  sellerId: string,
  createdBy: string,
  specs: TicketSpec[],
): Promise<string[]> {
  const rows = specs.map((s) => ({
    organization_id: orgId,
    raffle_id: raffleId,
    seller_id: sellerId,
    created_by: createdBy,
    daily_number: s.daily,
    weekly_number: s.weekly,
    inventory_status: s.status,
  }))
  const { data, error } = await admin.from('tickets').insert(rows).select('id')
  if (error) throw error
  return data.map((r) => r.id)
}

/** Cliente autenticado como un usuario real: recorre RLS y RPC como la app. */
async function signInAs(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(target.url, target.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime,
  })
  const { error } = await client.auth.signInWithPassword({
    email,
    password: target.seedPassword,
  })
  if (error) throw new Error(`No se pudo iniciar sesion como ${email}: ${error.message}`)
  return client
}

async function seedDemoBusiness(orgId: string, ids: Record<string, string>) {
  const owner = ids['owner@demo.test']!
  const seller1 = ids['vendedor1@demo.test']!
  const seller2 = ids['vendedor2@demo.test']!

  const raffleId = await createRaffle(orgId, owner, RAFFLE_DEMO, 120_000, true)
  console.log(`  rifa creada: ${RAFFLE_DEMO} ($120.000, activa)`)

  const ana = await createClientRow(orgId, seller1, 'Ana Torres', '3101112233', 'ana@ejemplo.test')
  const carlos = await createClientRow(orgId, seller1, 'Carlos Diaz', '3102223344', null)
  const beatriz = await createClientRow(orgId, seller1, 'Beatriz Rojas', '3103334455', null)
  const diego = await createClientRow(orgId, seller2, 'Diego Marin', '3104445566', null)
  await createClientRow(orgId, seller2, 'Elena Castro', '3105556677', 'elena@ejemplo.test')
  console.log('  clientes creados: 3 de vendedor1, 2 de vendedor2')

  // Vendedor 1: 6 para vender + 10 disponibles + 2 por aprobar + 3 borradores.
  // Los numeros ejercitan a proposito los ceros iniciales y el rango completo
  // de 1 a 4 digitos (BR-N02, BR-N03).
  const s1ToAssign = await createTickets(orgId, raffleId, seller1, owner, [
    { daily: '0001', weekly: '1001', status: 'available' },
    { daily: '0002', weekly: '1002', status: 'available' },
    { daily: '007', weekly: '1003', status: 'available' },
    { daily: '7', weekly: '1004', status: 'available' },
    { daily: '0000', weekly: '9999', status: 'available' },
    { daily: '1234', weekly: '5678', status: 'available' },
  ])
  await createTickets(
    orgId,
    raffleId,
    seller1,
    owner,
    Array.from({ length: 10 }, (_, i) => ({
      daily: String(100 + i).padStart(4, '0'),
      weekly: String(2000 + i),
      status: 'available' as const,
    })),
  )
  await createTickets(orgId, raffleId, seller1, owner, [
    { daily: '0301', weekly: '3001', status: 'pending_approval' },
    { daily: '0302', weekly: '3002', status: 'pending_approval' },
  ])
  await createTickets(orgId, raffleId, seller1, owner, [
    { daily: null, weekly: null, status: 'draft' },
    { daily: null, weekly: null, status: 'draft' },
    { daily: '0400', weekly: null, status: 'draft' },
  ])

  // Vendedor 2: 4 para vender + 5 disponibles
  const s2ToAssign = await createTickets(orgId, raffleId, seller2, owner, [
    { daily: '0501', weekly: '4001', status: 'available' },
    { daily: '0502', weekly: '4002', status: 'available' },
    { daily: '0503', weekly: '4003', status: 'available' },
    { daily: '0504', weekly: '4004', status: 'available' },
  ])
  await createTickets(
    orgId,
    raffleId,
    seller2,
    owner,
    Array.from({ length: 5 }, (_, i) => ({
      daily: String(600 + i).padStart(4, '0'),
      weekly: String(5000 + i),
      status: 'available' as const,
    })),
  )
  console.log('  boletas creadas: 21 de vendedor1, 9 de vendedor2')

  // --- Asignaciones y pagos, ejecutados como el vendedor real via RPC --------
  const v1 = await signInAs('vendedor1@demo.test')

  await v1.rpc('assign_ticket', { p_ticket_id: s1ToAssign[0]!, p_client_id: ana })
  await v1.rpc('assign_ticket', { p_ticket_id: s1ToAssign[1]!, p_client_id: ana })
  await v1.rpc('assign_ticket', { p_ticket_id: s1ToAssign[2]!, p_client_id: carlos })
  await v1.rpc('assign_ticket', { p_ticket_id: s1ToAssign[3]!, p_client_id: beatriz })
  await v1.rpc('assign_ticket', { p_ticket_id: s1ToAssign[4]!, p_client_id: beatriz })
  await v1.rpc('assign_ticket', { p_ticket_id: s1ToAssign[5]!, p_client_id: beatriz })

  const v2 = await signInAs('vendedor2@demo.test')
  await v2.rpc('assign_ticket', { p_ticket_id: s2ToAssign[0]!, p_client_id: diego })
  await v2.rpc('assign_ticket', { p_ticket_id: s2ToAssign[1]!, p_client_id: diego })
  console.log('  boletas asignadas: 6 de vendedor1, 2 de vendedor2')

  // Pago PARCIAL: $40.000 sobre una boleta de $120.000 -> Abonada, faltan $80.000
  const parcial = await v1.rpc('create_payment', {
    p_client_id: ana,
    p_total_amount: 40_000,
    p_allocations: [{ ticket_id: s1ToAssign[0]!, amount: 40_000 }],
    p_payment_method: 'cash',
    p_notes: 'Abono inicial',
  })
  if (parcial.error) throw parcial.error

  // Pago COMPLETO: $120.000 -> Pagada, saldo $0
  const completo = await v1.rpc('create_payment', {
    p_client_id: carlos,
    p_total_amount: 120_000,
    p_allocations: [{ ticket_id: s1ToAssign[2]!, amount: 120_000 }],
    p_payment_method: 'transfer',
    p_notes: 'Pago total',
  })
  if (completo.error) throw completo.error

  // Pago REPARTIDO entre dos boletas, las dos Abonadas. La de $100.000 es el
  // CASO CRITICO de D-098: el importe que con el precio viejo la dejaba Pagada
  // ahora deja $20.000 pendientes, y la pantalla tiene que decirlo.
  const repartido = await v1.rpc('create_payment', {
    p_client_id: beatriz,
    p_total_amount: 150_000,
    p_allocations: [
      { ticket_id: s1ToAssign[3]!, amount: 100_000 },
      { ticket_id: s1ToAssign[4]!, amount: 50_000 },
    ],
    p_payment_method: 'cash',
    p_notes: 'Pago de dos boletas',
  })
  if (repartido.error) throw repartido.error

  // Pago que luego se ANULA (el historial debe conservarlo)
  const aAnular = await v1.rpc('create_payment', {
    p_client_id: ana,
    p_total_amount: 20_000,
    p_allocations: [{ ticket_id: s1ToAssign[1]!, amount: 20_000 }],
    p_payment_method: 'other',
    p_notes: 'Pago registrado por error',
  })
  if (aAnular.error) throw aAnular.error

  const ownerClient = await signInAs('owner@demo.test')
  const anulacion = await ownerClient.rpc('void_payment', {
    p_payment_id: aAnular.data as string,
    p_reason: 'Registrado por error durante el seed de desarrollo',
  })
  if (anulacion.error) throw anulacion.error

  console.log(
    '  pagos: 1 parcial ($40.000), 1 completo ($120.000), 1 repartido ($100.000 + $50.000), 1 anulado',
  )
}

async function seedControlBusiness(orgId: string, ids: Record<string, string>) {
  const owner = ids['owner@control.test']!
  const seller = ids['vendedor@control.test']!

  const raffleId = await createRaffle(orgId, owner, RAFFLE_CONTROL, 50_000, false)

  // Combinaciones IDENTICAS a las de la otra organizacion: deben poder coexistir
  // porque la unicidad es por rifa (BR-N06), y ninguna organizacion ve a la otra.
  await createTickets(orgId, raffleId, seller, owner, [
    { daily: '0001', weekly: '1001', status: 'available' },
    { daily: '1234', weekly: '5678', status: 'available' },
    { daily: '0000', weekly: '9999', status: 'available' },
  ])
  await createClientRow(orgId, seller, 'Fabio Nieto', '3106667788', null)

  console.log(`  rifa creada: ${RAFFLE_CONTROL} ($50.000) con combinaciones repetidas a proposito`)
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Seed contra ${target.label}\n`)

  console.log(`Organizacion "${ORG_DEMO}"...`)
  const demo = await seedUsersAndOrgs(ORG_DEMO, DEMO_USERS)

  console.log(`\nOrganizacion "${ORG_CONTROL}"...`)
  const control = await seedUsersAndOrgs(ORG_CONTROL, CONTROL_USERS)

  console.log('\nDatos de negocio...')
  if (await raffleExists(demo.orgId, RAFFLE_DEMO)) {
    console.log('  ya existian; no se vuelven a crear (seed idempotente)')
  } else {
    await seedDemoBusiness(demo.orgId, demo.ids)
    await seedControlBusiness(control.orgId, control.ids)
  }

  console.log('\nListo. Cuentas de desarrollo:')
  for (const u of [...DEMO_USERS, ...CONTROL_USERS]) {
    console.log(`  ${u.role.padEnd(6)} ${u.email}`)
  }
  console.log(
    target.isLocal
      ? `\n  Contrasena local: ${target.seedPassword}`
      : '\n  Contrasena: la definida en SEED_DEFAULT_PASSWORD (.env.local)',
  )
}

main().catch((error) => {
  console.error('\nError en el seed:', error)
  process.exit(1)
})
