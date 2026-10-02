import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { Client as PgClient } from 'pg'

import { MEMBERSHIP_CHECK_MESSAGE } from '../../src/lib/auth/membership-check'

import {
  DB_URL,
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_URL,
  serviceClient,
  setMembershipActive,
} from './db-setup'
import { ACCOUNTS, loginAs, SEED_PASSWORD, unique } from './fixtures'

/**
 * I-115 (D-248): cuando no se puede COMPROBAR la membresía, nadie pierde la sesión ni lee que su
 * cuenta está inactiva.
 *
 * El fallo es el de I-202: PostgREST responde 401 `PGRST303 «JWT issued at future»` a la lectura de
 * `memberships`. Se provoca en la base LOCAL con el mismo mecanismo que la pausa de publicación
 * (`pgrst.db_pre_request` y `raise sqlstate 'PGRST'`, D-239), pero solo para UN perfil y solo en
 * `/memberships`: el resto de la aplicación —y de los demás usuarios— funciona.
 *
 * Lo que se comprueba, con dos sesiones del mismo vendedor:
 *   · una pantalla abierta durante el fallo enseña «Algo salió mal», no «Tu cuenta está inactiva», y
 *     ninguna sesión se cierra;
 *   · al volver el servicio, «Reintentar» sigue sin volver a entrar, y la otra sesión también;
 *   · una Server Action dice que no pudo comprobar el acceso y conserva lo escrito;
 *   · iniciar sesión durante el fallo no la cierra, y al volver se entra sin escribir otra vez la
 *     contraseña;
 *   · una ruta de la API responde 503;
 *   · y una cuenta desactivada de verdad sigue saliendo de todos sus dispositivos (BR-A04).
 *
 * ⚠️ El gancho se instala en `beforeAll` y se retira en `afterAll` pase lo que pase; las pruebas van
 * en serie, como las de la pausa. Va en la configuración de `authenticator` PARA ESTA BASE (`in
 * database postgres`), así que si una pasada se corta, `db:reset` se lo lleva con la base. Una
 * cabecera propia, `x-prueba-i115`, lo hace fallar a demanda para saber cuándo PostgREST lo cargó y
 * cuándo lo soltó.
 */

test.describe.configure({ mode: 'serial' })

let db: PgClient
let sellerId: string

const INSTALL = `
create schema prueba_i115;
create table prueba_i115.fallo (
  id int primary key default 1,
  activo boolean not null default false,
  perfiles uuid[] not null default '{}'
);
insert into prueba_i115.fallo (id) values (1);
create function prueba_i115.antes_de_cada_peticion() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_fallo  prueba_i115.fallo%rowtype;
  v_sub    text := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::json ->> 'sub';
  v_sondeo text := nullif(pg_catalog.current_setting('request.headers', true), '')::json ->> 'x-prueba-i115';
begin
  if pg_catalog.current_setting('request.path', true) is distinct from '/memberships' then
    return;
  end if;
  if v_sondeo is null then
    select * into v_fallo from prueba_i115.fallo f where f.id = 1;
    -- Se compara como texto: un «sub» que no fuera un uuid no puede romper la petición.
    if not coalesce(v_fallo.activo, false) or v_sub is null
       or not (v_sub = any (v_fallo.perfiles::text[])) then
      return;
    end if;
  end if;
  raise sqlstate 'PGRST' using
    message = '{"code":"PGRST303","message":"JWT issued at future","details":null,"hint":null}',
    detail = '{"status":401,"headers":{}}';
end;
$$;
revoke all on function prueba_i115.antes_de_cada_peticion() from public;
grant usage on schema prueba_i115 to anon, authenticated, service_role;
grant execute on function prueba_i115.antes_de_cada_peticion() to anon, authenticated, service_role;
alter role authenticator in database postgres set pgrst.db_pre_request = 'prueba_i115.antes_de_cada_peticion';
notify pgrst, 'reload config';
`

/** ¿Tiene PostgREST el gancho cargado? Con la cabecera de sondeo, solo entonces responde 401. */
async function hookLoaded(): Promise<boolean> {
  const res = await fetch(`${LOCAL_URL}/rest/v1/memberships?select=id&limit=1`, {
    headers: {
      apikey: LOCAL_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
      'x-prueba-i115': 'sondeo',
    },
  })
  return res.status === 401
}

async function retire() {
  await db.query('alter role authenticator in database postgres reset pgrst.db_pre_request')
  await db.query(`notify pgrst, 'reload config'`)
  if ((await db.query(`select to_regnamespace('prueba_i115') as s`)).rows[0].s) {
    await expect.poll(hookLoaded, { timeout: 15_000 }).toBe(false)
  }
  await db.query('drop schema if exists prueba_i115 cascade')
}

/** Enciende o apaga el fallo para el vendedor. El gancho lee la tabla en cada petición. */
async function failure(active: boolean) {
  await db.query('update prueba_i115.fallo set activo = $1, perfiles = $2 where id = 1', [
    active,
    [sellerId],
  ])
}

async function sellerSessions(): Promise<number> {
  const { rows } = await db.query(
    'select count(*)::int as n from auth.sessions where user_id = $1',
    [sellerId],
  )
  return rows[0].n
}

async function signedIn(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await loginAs(page, ACCOUNTS.seller)
  return { context, page }
}

async function expectErrorPage(page: Page) {
  await expect(page.getByRole('heading', { name: 'Algo salió mal' })).toBeVisible()
  await expect(page.getByText('Tu cuenta está inactiva')).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/login/)
}

test.beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  await retire()
  const { rows } = await db.query('select id from public.profiles where email = $1', [
    ACCOUNTS.seller,
  ])
  sellerId = rows[0].id
  await db.query(INSTALL)
  // PostgREST recarga la configuración en segundo plano: se espera a que el gancho esté.
  await expect.poll(hookLoaded, { timeout: 15_000 }).toBe(true)
})

test.afterAll(async () => {
  await retire()
  await db.end()
})

test.afterEach(async () => {
  await failure(false)
})

test('una pantalla abierta durante el fallo no cierra ninguna sesión, y al volver se sigue sin entrar otra vez', async ({
  browser,
}) => {
  const a = await signedIn(browser)
  const b = await signedIn(browser)
  const before = await sellerSessions()

  await failure(true)
  // Abrir la aplicación —la instalada arranca en la portada— tampoco dice «inactiva».
  await a.page.goto('/')
  await expectErrorPage(a.page)
  await a.page.goto('/seller/tickets')
  await expectErrorPage(a.page)
  expect(await sellerSessions(), 'ninguna sesión se cerró').toBe(before)

  await failure(false)
  await a.page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(a.page.getByRole('heading', { name: 'Mis boletas' })).toBeVisible()
  await expect(a.page).toHaveURL(/\/seller\/tickets$/)

  // La otra sesión, la que no vio nada, sigue sirviendo sin volver a entrar.
  await b.page.goto('/seller/clients')
  await expect(b.page.getByRole('heading', { name: 'Mis clientes' })).toBeVisible()
  expect(await sellerSessions()).toBe(before)

  await a.context.close()
  await b.context.close()
})

test('una Server Action durante el fallo dice que no pudo comprobar el acceso y conserva lo escrito', async ({
  browser,
}) => {
  const { context, page } = await signedIn(browser)
  const name = unique('Cliente I-115')
  const before = await sellerSessions()
  try {
    await page.goto('/seller/clients/new')
    await page.getByLabel('Nombre').fill(name)
    await page.getByLabel('Teléfono').fill('3004445566')

    await failure(true)
    await page.getByRole('button', { name: 'Crear cliente' }).click()
    await expect(page.getByText(MEMBERSHIP_CHECK_MESSAGE).first()).toBeVisible()
    await expect(page).toHaveURL(/\/seller\/clients\/new$/)
    await expect(page.getByLabel('Nombre')).toHaveValue(name)
    expect(await sellerSessions()).toBe(before)
    expect(
      (await serviceClient().from('clients').select('id').eq('name', name)).data,
      'la acción no hizo nada',
    ).toHaveLength(0)

    // Al volver el servicio, el mismo botón guarda, sin entrar otra vez.
    await failure(false)
    await page.getByRole('button', { name: 'Crear cliente' }).click()
    await expect
      .poll(
        async () =>
          (await serviceClient().from('clients').select('id').eq('name', name)).data?.length,
      )
      .toBe(1)
  } finally {
    await serviceClient().from('clients').delete().eq('name', name)
    await context.close()
  }
})

test('iniciar sesión durante el fallo no la cierra, y al volver se entra sin escribir otra vez la contraseña', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const before = await sellerSessions()

  await failure(true)
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(ACCOUNTS.seller)
  await page.getByLabel('Contraseña').fill(SEED_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expectErrorPage(page)
  expect(await sellerSessions(), 'la sesión nueva se conserva').toBe(before + 1)

  await failure(false)
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await page.waitForURL(/\/seller\/dashboard/)
  await context.close()
})

test('una ruta de la API responde 503 con el mensaje temporal, no 403 «inactiva»', async ({
  browser,
}) => {
  const { context, page } = await signedIn(browser)
  await failure(true)
  const res = await page.request.get('/api/reports/export?report=payments')
  expect(res.status()).toBe(503)
  expect(await res.json()).toEqual({ error: MEMBERSHIP_CHECK_MESSAGE })
  await context.close()
})

test('una cuenta desactivada de verdad sigue saliendo de todos sus dispositivos (BR-A04)', async ({
  browser,
}) => {
  // La otra cuenta de vendedor, como `security.spec.ts`: la principal la usan las demás pruebas.
  const sessionsOf = async (email: string) =>
    (
      await db.query(
        'select count(*)::int as n from auth.sessions s join auth.users u on u.id = s.user_id where u.email = $1',
        [email],
      )
    ).rows[0].n as number
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await loginAs(page, ACCOUNTS.otherSeller)
    expect(await sessionsOf(ACCOUNTS.otherSeller)).toBeGreaterThan(0)

    await setMembershipActive(ACCOUNTS.otherSeller, false)
    await page.goto('/seller/tickets')
    await expect(page).toHaveURL(/\/login\?error=inactive/)
    await expect(page.getByText('Tu cuenta está inactiva')).toBeVisible()
    expect(
      await sessionsOf(ACCOUNTS.otherSeller),
      'el cierre de una cuenta inactiva sigue siendo global',
    ).toBe(0)
  } finally {
    await setMembershipActive(ACCOUNTS.otherSeller, true)
    await context.close()
  }
})
