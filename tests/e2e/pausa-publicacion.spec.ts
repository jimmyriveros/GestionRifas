import { execFileSync } from 'node:child_process'

import { expect, test, type Page } from '@playwright/test'
import { Client as PgClient } from 'pg'

import {
  close,
  install,
  open,
  allow,
  probe,
  type ApiTarget,
  type Options,
} from '../../scripts/maintenance-pause'
import { MAINTENANCE_PATH, MAINTENANCE_PAUSE_MESSAGE } from '../../src/lib/maintenance-pause'

import { configurarCatalogo, CATALOG_SLUG } from './catalogo-helpers'
import {
  DB_URL,
  LOCAL_ANON_KEY,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_URL,
  loadSeedRefs,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, loginAs, SEED_PASSWORD, unique } from './fixtures'

/**
 * La pausa de publicación vista por quien usa la aplicación (D-239, `RUNBOOK` §10).
 *
 * La base cierra la API (`supabase/maintenance/pausa.sql`); esto comprueba lo que
 * ve cada persona mientras tanto y al abrir:
 *
 *   · quien navega llega a «Estamos actualizando Rifas» y CONSERVA SU SESIÓN
 *     —antes, la guarda lo tomaba por una cuenta inactiva, cerraba su sesión en
 *     todos los dispositivos y decía «Tu cuenta está inactiva» (I-115)—;
 *   · una acción a medio escribir dice qué pasa y no borra lo escrito;
 *   · quien entra durante la pausa acaba en la misma pantalla, y el catálogo
 *     público dice lo de siempre ante un corte;
 *   · el Dueño permitido comprueba la publicación y nadie más pasa;
 *   · al abrir —solo si la base y el código servido son los esperados— cada quien
 *     sigue donde estaba, sin volver a entrar.
 *
 * ⚠️ MIENTRAS CORRE, LA API LOCAL ENTERA ESTÁ CERRADA: las pruebas son en serie y el
 * `afterAll` la abre y la retira pase lo que pase. Todo lo que prepara datos va con
 * la pausa ABIERTA —la service role también recibe 423—.
 */

test.describe.configure({ mode: 'serial' })

const API: ApiTarget = {
  url: LOCAL_URL,
  anonKey: LOCAL_ANON_KEY,
  serviceKey: LOCAL_SERVICE_ROLE_KEY,
  site: 'http://localhost:3000',
}

const OPTIONS: Options = {
  command: 'cerrar',
  target: { kind: 'local', projectRef: null },
  horizonMinutes: 0,
  drainSeconds: 30,
  migration: null,
  commit: null,
  site: null,
  allowed: [],
}

let db: PgClient
let refs: SeedRefs
const nombre = unique('Cliente en la pausa')

/** Retira la pausa esté como esté. */
async function forceRetire() {
  if ((await db.query(`select to_regclass('pausa.estado') as t`)).rows[0].t) {
    await db.query(`update pausa.estado set cerrada = false, permitidos = '{}' where id = 1`)
  }
  await db.query(`alter role authenticator reset pgrst.db_pre_request`)
  await db.query(`notify pgrst, 'reload config'`)
  for (let i = 0; i < 40; i++) {
    const p = await probe(API, 'service')
    if (p.pausa === null && p.status < 400) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  await db.query('drop schema if exists pausa cascade')
}

async function expectMaintenance(page: Page) {
  await expect(page).toHaveURL(new RegExp(`${MAINTENANCE_PATH}$`))
  await expect(page.getByRole('heading', { name: 'Estamos actualizando Rifas' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reintentar' })).toBeVisible()
}

test.beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  await forceRetire()
  refs = await loadSeedRefs()
  // Con la pausa abierta: el catálogo del vendedor 1 publicado, para verlo después.
  await configurarCatalogo(refs, true)
  const outcome = await install(db, API)
  expect(outcome.ok, outcome.lines.join('\n')).toBe(true)
})

test.afterAll(async () => {
  await forceRetire()
  await serviceClient()
    .from('memberships')
    .update({
      public_slug: null,
      public_catalog_enabled: false,
      public_whatsapp_number: null,
      public_raffle_id: null,
    })
    .eq('profile_id', refs.sellerId)
  await serviceClient().from('clients').delete().eq('name', nombre)
  await db.end()
})

test('durante la pausa, quien navega ve «Estamos actualizando Rifas», conserva su sesión y lo escrito', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.seller)
  await page.goto('/seller/clients/new')
  await page.getByLabel('Nombre').fill(nombre)
  await page.getByLabel('Teléfono').fill('3004445566')

  const outcome = await close(db, API, OPTIONS)
  expect(outcome.ok, outcome.lines.join('\n')).toBe(true)

  // La acción no se hace, lo dice y no se lleva lo escrito.
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByText(MAINTENANCE_PAUSE_MESSAGE).first()).toBeVisible()
  await expect(page).toHaveURL(/\/seller\/clients\/new$/)
  await expect(page.getByLabel('Nombre')).toHaveValue(nombre)

  // Navegar lleva a la pantalla de la pausa, no al login.
  await page.goto('/seller/tickets')
  await expectMaintenance(page)
  await expect(page.getByText('Tu cuenta está inactiva')).toHaveCount(0)
  const cookies = await page.context().cookies()
  expect(cookies.some((c) => c.name.includes('auth-token'))).toBe(true)

  // «Reintentar» vuelve a intentar desde la portada; con la pausa cerrada, aquí otra vez.
  await page.getByRole('link', { name: 'Reintentar' }).click()
  await expectMaintenance(page)
})

test('sin sesión: el catálogo público dice lo de siempre y entrar lleva a la pantalla de la pausa', async ({
  page,
}) => {
  await page.goto(`/catalogo/${CATALOG_SLUG}`)
  await expect(page.getByText('No pudimos cargar los números disponibles')).toBeVisible()

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(ACCOUNTS.owner)
  await page.getByLabel('Contraseña').fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expectMaintenance(page)
})

test('el Dueño permitido comprueba la publicación; el vendedor sigue en la pausa', async ({
  page,
  browser,
}) => {
  expect((await allow(db, { ...OPTIONS, command: 'permitir', allowed: [refs.ownerId] })).ok).toBe(
    true,
  )

  await loginAs(page, ACCOUNTS.owner)
  await expect(page).toHaveURL(/\/owner\/dashboard/)
  await expect(page.getByRole('heading', { name: 'Estamos actualizando Rifas' })).toHaveCount(0)

  const otra = await browser.newContext()
  const vendedor = await otra.newPage()
  await vendedor.goto('/login')
  await vendedor.getByLabel('Correo electrónico').fill(ACCOUNTS.seller)
  await vendedor.getByLabel('Contraseña').fill(SEED_PASSWORD)
  await vendedor.getByRole('button', { name: 'Ingresar' }).click()
  await expectMaintenance(vendedor)
  await otra.close()
})

test('al abrir —con la base y el código comprobados— cada quien sigue donde estaba sin volver a entrar', async ({
  page,
}) => {
  // Entra DURANTE la pausa: Auth funciona, la sesión queda y la pantalla es la de la pausa.
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(ACCOUNTS.seller)
  await page.getByLabel('Contraseña').fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expectMaintenance(page)

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const { rows } = await db.query(
    `select max(version) as v from supabase_migrations.schema_migrations`,
  )
  const wrong = await open(db, API, { ...OPTIONS, command: 'abrir', migration: '0001', commit })
  expect(wrong.ok, 'una migración que no es la aplicada no abre').toBe(false)
  const outcome = await open(db, API, {
    ...OPTIONS,
    command: 'abrir',
    migration: rows[0].v,
    commit,
  })
  expect(outcome.ok, outcome.lines.join('\n')).toBe(true)

  await page.getByRole('link', { name: 'Reintentar' }).click()
  await expect(page).toHaveURL(/\/seller\/dashboard/)
  await page.goto('/seller/tickets')
  await expect(page).toHaveURL(/\/seller\/tickets/)

  // Lo que se intentó durante la pausa no se guardó en ninguna parte.
  const { data } = await serviceClient().from('clients').select('id').eq('name', nombre)
  expect(data).toEqual([])
})
