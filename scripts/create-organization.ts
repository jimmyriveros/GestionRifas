/**
 * Alta operativa de una organizacion nueva y su primer Owner (Fase 8).
 *
 *   tsx scripts/create-organization.ts --name "Rifas Acme" \
 *     --owner-email owner@acme.com --owner-name "Nombre Apellido" \
 *     --owner-phone "3001234567" [--owner-alias "Apodo"] [--local]
 *
 * Bootstrap fuera de la aplicacion: `createUser` (src/features/users/actions.ts)
 * exige una sesion de Owner/Admin ya autenticada DENTRO de su propia
 * organizacion (policy `memberships_insert_staff`, que ademas exige
 * `organization_id in (select current_org_ids())`) - imposible para una
 * organizacion que todavia no existe para nadie. Por eso este script usa el
 * cliente de SERVICE ROLE para las tres escrituras: es el unico caso legitimo
 * de alta de un `owner` sin una sesion de staff previa desde la cual actuar
 * (D-066). Fuera de este bootstrap puntual, la aplicacion nunca inserta
 * membresias sin pasar por RLS.
 *
 * Reutiliza exactamente los pasos que la aplicacion ya probo:
 *   - alta de organizacion: mismo patron select-or-insert que
 *     scripts/seed.ts (ensureOrganization).
 *   - alta del Owner por INVITACION real por correo (nunca contrasena en
 *     texto plano, D-045), mismo flujo que `createUser` en
 *     src/features/users/actions.ts:61-76.
 *
 * Idempotente: si la organizacion ya existe se reutiliza; si ya tiene un
 * Owner activo el script se detiene sin crear un segundo (BR-U04 y el propio
 * indice unico `memberships_one_owner_per_org` lo respaldan en la base de
 * datos).
 */
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

import { resolveTarget } from './supabase-target'
import type { Database } from '../src/types/database.types'

// Mismo patron que el CHECK de profiles/clients en la base de datos
// (src/lib/constants.ts PHONE_REGEX) - duplicado aqui porque los scripts se
// ejecutan con tsx y no resuelven el alias "@/" de Next.js (ver scripts/seed.ts,
// que por la misma razon importa Database por ruta relativa).
const PHONE_REGEX = /^[0-9+ ()-]{7,20}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Node 20 no trae WebSocket nativo; @supabase/realtime-js lo exige aunque no
// se use realtime (D-033).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const realtime = { transport: WebSocket as any }

type BootstrapInput = {
  orgName: string
  ownerEmail: string
  ownerName: string
  ownerPhone: string
  ownerAlias: string
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function fail(message: string): never {
  console.error(`\nError: ${message}`)
  process.exit(1)
}

function usage(): never {
  console.error(
    'Uso: tsx scripts/create-organization.ts --name "Rifas Acme" ' +
      '--owner-email owner@acme.com --owner-name "Nombre Apellido" ' +
      '--owner-phone "3001234567" [--owner-alias "Apodo"] [--local]',
  )
  process.exit(1)
}

function parseArgs(): BootstrapInput {
  const orgName = readArg('name')?.trim()
  const ownerEmail = readArg('owner-email')?.trim().toLowerCase()
  const ownerName = readArg('owner-name')?.trim()
  const ownerPhone = readArg('owner-phone')?.trim()
  const ownerAlias = readArg('owner-alias')?.trim() ?? ''

  if (!orgName || !ownerEmail || !ownerName || !ownerPhone) usage()
  if (orgName.length < 2) fail('El nombre de la organizacion debe tener al menos 2 caracteres.')
  if (!EMAIL_REGEX.test(ownerEmail)) fail(`Correo invalido: ${ownerEmail}`)
  if (ownerName.length < 2) fail('El nombre del Owner debe tener al menos 2 caracteres.')
  if (!PHONE_REGEX.test(ownerPhone)) fail(`Telefono invalido: ${ownerPhone} (7 a 20 digitos).`)

  return { orgName, ownerEmail, ownerName, ownerPhone, ownerAlias }
}

const target = resolveTarget()
const admin = createClient<Database>(target.url, target.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime,
})

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? ''
}

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

async function ensureOrganization(name: string): Promise<{ id: string; isNew: boolean }> {
  const { data: existing, error: selectError } = await admin
    .from('organizations')
    .select('id')
    .eq('name', name)
    .maybeSingle()
  if (selectError) throw selectError
  if (existing) return { id: existing.id, isNew: false }

  const { data: created, error } = await admin
    .from('organizations')
    .insert({ name })
    .select('id')
    .single()
  if (error) throw error
  return { id: created.id, isNew: true }
}

async function findActiveOwner(orgId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('memberships')
    .select('profile_id')
    .eq('organization_id', orgId)
    .eq('role', 'owner')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return data?.profile_id ?? null
}

async function main() {
  const input = parseArgs()
  console.log(`Organizacion "${input.orgName}" - destino: ${target.label}\n`)

  const org = await ensureOrganization(input.orgName)
  console.log(
    org.isNew
      ? `  organizacion creada: ${input.orgName}`
      : `  organizacion ya existia: ${input.orgName}`,
  )

  const existingOwnerId = await findActiveOwner(org.id)
  if (existingOwnerId) {
    fail(
      `La organizacion "${input.orgName}" ya tiene un Owner activo (perfil ${existingOwnerId}).\n` +
        'Este script no crea un segundo Owner (BR-U04). Da de alta administradores y ' +
        'vendedores adicionales desde la aplicacion (/owner/users, /owner/sellers).',
    )
  }

  const existingUserId = await findUserIdByEmail(input.ownerEmail)
  let profileId: string
  let invited: boolean

  if (existingUserId) {
    profileId = existingUserId
    invited = false
    console.log(`  ya existia una cuenta para ${input.ownerEmail}: no se reenvio invitacion`)
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.ownerEmail, {
      data: {
        full_name: input.ownerName,
        alias: input.ownerAlias === '' ? null : input.ownerAlias,
        phone: input.ownerPhone,
      },
      redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
    })
    if (error || !data?.user) fail(`No se pudo invitar a ${input.ownerEmail}: ${error?.message}`)
    profileId = data.user.id
    invited = true
    console.log(`  invitacion enviada: ${input.ownerEmail}`)
  }

  const { error: membershipError } = await admin
    .from('memberships')
    .insert({ organization_id: org.id, profile_id: profileId, role: 'owner', is_active: true })

  if (membershipError) {
    if (invited) {
      // Compensacion (igual que createUser en actions.ts:88-94): sin
      // membresia la cuenta no sirve para nada y dejaria el correo
      // bloqueado para siempre. Solo se borra si la creo esta corrida.
      await admin.auth.admin.deleteUser(profileId)
    }
    fail(`No se pudo crear la membresia de Owner: ${membershipError.message}`)
  }

  console.log(`\nListo. "${input.orgName}" (${org.id}) tiene a ${input.ownerEmail} como Owner.`)
  if (invited) {
    console.log('Se envio un correo de invitacion para que la persona fije su contrasena.')
  } else {
    console.log('La cuenta de correo ya existia: no se envio invitacion nueva.')
    console.log('Si necesita el enlace otra vez, puede usar "Olvide mi contrasena" desde /login.')
  }
}

main().catch((error) => {
  console.error('\nError inesperado:', error)
  process.exit(1)
})
