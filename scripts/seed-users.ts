/**
 * Crea los usuarios de desarrollo (Owner, Admin, 2 Sellers), la organizacion
 * demo y las membresias correspondientes. Usa SUPABASE_SERVICE_ROLE_KEY:
 * solo para entornos de desarrollo, nunca contra produccion.
 *
 * Idempotente: si un usuario/organizacion/membresia ya existe, lo reutiliza.
 * La contrasena para las 4 cuentas es SEED_DEFAULT_PASSWORD (.env.local).
 *
 * Uso: npm run seed:users
 */
import { config } from 'dotenv'

config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

import type { Database } from '../src/types/database.types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PASSWORD) {
  console.error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o SEED_DEFAULT_PASSWORD en .env.local',
  )
  process.exit(1)
}

const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  // Node 20 no trae WebSocket nativo; @supabase/realtime-js lo exige
  // incluso sin usar realtime. Ver la misma nota en lib/supabase/admin.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realtime: { transport: WebSocket as any },
})

const ORG_NAME = 'Rifas Demo'

type SeedUser = {
  email: string
  fullName: string
  phone: string
  role: Database['public']['Enums']['app_role']
}

const SEED_USERS: SeedUser[] = [
  { email: 'owner@demo.test', fullName: 'Camila Restrepo', phone: '3001234567', role: 'owner' },
  { email: 'admin@demo.test', fullName: 'Andres Gomez', phone: '3002345678', role: 'admin' },
  { email: 'vendedor1@demo.test', fullName: 'Julian Vargas', phone: '3003456789', role: 'seller' },
  { email: 'vendedor2@demo.test', fullName: 'Laura Moreno', phone: '3004567890', role: 'seller' },
]

async function findUserIdByEmail(email: string): Promise<string | null> {
  // auth.admin no expone getUserByEmail; se pagina listUsers hasta encontrarlo.
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
 * auth.admin.createUser({ password }) crea el usuario pero, al menos en este
 * proyecto, la contrasena queda en un estado que rechaza el login inmediato
 * (verificado: signInWithPassword falla justo despues de createUser, y
 * funciona de inmediato tras un updateUserById posterior con la misma
 * contrasena). Por eso siempre se confirma la contrasena con un segundo
 * paso, tanto para usuarios nuevos como existentes.
 */
async function ensureAuthUser(user: SeedUser): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: user.fullName, phone: user.phone },
  })

  let profileId: string
  if (!error && data.user) {
    console.log(`  creado: ${user.email}`)
    profileId = data.user.id
  } else {
    const alreadyExists = /already|existe|registered/i.test(error?.message ?? '')
    if (!alreadyExists) {
      throw error ?? new Error(`No se pudo crear ${user.email}`)
    }
    const existingId = await findUserIdByEmail(user.email)
    if (!existingId) throw new Error(`${user.email} reporta duplicado pero no se encontro`)
    console.log(`  ya existia: ${user.email}`)
    profileId = existingId
  }

  const { error: pwError } = await admin.auth.admin.updateUserById(profileId, { password: PASSWORD })
  if (pwError) throw pwError

  return profileId
}

async function ensureOrganization(): Promise<string> {
  const { data: existing, error: selectError } = await admin
    .from('organizations')
    .select('id')
    .eq('name', ORG_NAME)
    .maybeSingle()

  if (selectError) throw selectError
  if (existing) {
    console.log(`  organizacion ya existia: ${ORG_NAME}`)
    return existing.id
  }

  const { data: created, error: insertError } = await admin
    .from('organizations')
    .insert({ name: ORG_NAME })
    .select('id')
    .single()

  if (insertError) throw insertError
  console.log(`  organizacion creada: ${ORG_NAME}`)
  return created.id
}

async function ensureMembership(organizationId: string, profileId: string, role: SeedUser['role']) {
  const { error } = await admin
    .from('memberships')
    .upsert(
      { organization_id: organizationId, profile_id: profileId, role, is_active: true },
      { onConflict: 'organization_id,profile_id' },
    )
  if (error) throw error
}

async function main() {
  console.log('Creando organizacion...')
  const organizationId = await ensureOrganization()

  console.log('Creando usuarios...')
  for (const user of SEED_USERS) {
    const profileId = await ensureAuthUser(user)
    await ensureMembership(organizationId, profileId, user.role)
  }

  console.log('\nListo. Cuentas de desarrollo (contrasena en SEED_DEFAULT_PASSWORD):')
  for (const user of SEED_USERS) {
    console.log(`  ${user.role.padEnd(6)} ${user.email}`)
  }
}

main().catch((error) => {
  console.error('Error en el seed:', error)
  process.exit(1)
})
