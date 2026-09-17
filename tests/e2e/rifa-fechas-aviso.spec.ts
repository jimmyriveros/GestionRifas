import { expect, test, type Page } from '@playwright/test'
import { Client as PgClient } from 'pg'

import { RAFFLE_DATE_CHANGE_NOTICE } from '../../src/features/raffles/date-change'
import { loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, expectToast, loginAs, unique } from './fixtures'

/**
 * Cambiar las fechas de una rifa ACTIVA avisa a las demás personas de la
 * organización (BR-R12, D-206, migración `0064`).
 *
 * El aviso lo escribe la base; lo que se comprueba aquí es la pantalla: que la
 * de editar lo dice ANTES de guardar —y solo cuando va a pasar—, y que el
 * vendedor lo lee en su campana con la fecha nueva y sin nada de la cartera.
 * Quién lo recibe y quién no, la atomicidad y los reintentos los prueba
 * `tests/db/raffle-date-notices.test.ts`.
 *
 * Las rifas viven en 2063 y se borran al final, con sus avisos y su bitácora.
 */

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

let refs: SeedRefs
const creadas: string[] = []
const activaName = unique('E2E fechas activa')
const borradorName = unique('E2E fechas borrador')
let activaId = ''
let borradorId = ''

/**
 * Escribe la fecha de fin cuando React ya hidrató el campo.
 *
 * Escrita ANTES, la hidratación repone el valor guardado y la prueba mira un
 * formulario que nunca vio el cambio (el hueco de TESTING §5.3). Lo detectó la
 * primera corrida de la prueba del borrador: «Received: 2063-11-01». React marca
 * cada nodo hidratado con su fibra; hasta que el campo la tiene, no se escribe.
 */
async function escribirFechaDeFin(page: Page, valor: string): Promise<void> {
  const campo = page.getByLabel('Fecha de fin')
  await expect(campo).toBeVisible()
  await page.waitForFunction(() => {
    const input = document.querySelector('input[name="endDate"]')
    return input !== null && Object.keys(input).some((clave) => clave.startsWith('__reactFiber$'))
  })
  await campo.fill(valor)
  await expect(campo).toHaveValue(valor)
}

async function nuevaRifa(name: string, activa: boolean): Promise<string> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('raffles')
    .insert({
      organization_id: refs.organizationId,
      name,
      ticket_price: 120_000,
      start_date: '2063-07-27',
      end_date: '2063-11-01',
      created_by: refs.ownerId,
    })
    .select('id')
    .single()
  if (error) throw error
  creadas.push(data.id)
  if (activa) {
    const activar = await svc.from('raffles').update({ status: 'active' }).eq('id', data.id)
    if (activar.error) throw activar.error
  }
  return data.id
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  activaId = await nuevaRifa(activaName, true)
  borradorId = await nuevaRifa(borradorName, false)
})

test.afterAll(async () => {
  if (creadas.length === 0) return
  const db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  try {
    await db.query('begin')
    await db.query(`set local session_replication_role = replica`)
    await db.query(
      `delete from notifications where kind = 'raffle.dates_changed'
          and (data ->> 'raffle_id')::uuid = any ($1::uuid[])`,
      [creadas],
    )
    await db.query(`delete from audit_logs where entity_id = any ($1::uuid[])`, [creadas])
    await db.query(`delete from raffles where id = any ($1::uuid[])`, [creadas])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  } finally {
    await db.end()
  }
})

test.describe('Las fechas de una rifa activa (BR-R12)', () => {
  test('la pantalla de editar dice que avisará, solo cuando cambia una fecha, y guarda', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/raffles/${activaId}/edit`)

    const fin = page.getByLabel('Fecha de fin')
    await expect(fin).toHaveValue('2063-11-01')
    // Sin cambiar ninguna fecha no se anuncia nada.
    await expect(page.getByText(RAFFLE_DATE_CHANGE_NOTICE)).toHaveCount(0)

    await escribirFechaDeFin(page, '2063-12-21')
    await expect(page.getByText(RAFFLE_DATE_CHANGE_NOTICE)).toBeVisible()

    // Volver a la fecha guardada lo retira: ya no va a pasar.
    await escribirFechaDeFin(page, '2063-11-01')
    await expect(page.getByText(RAFFLE_DATE_CHANGE_NOTICE)).toHaveCount(0)

    await escribirFechaDeFin(page, '2063-12-21')
    await expect(page.getByText(RAFFLE_DATE_CHANGE_NOTICE)).toBeVisible()
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, 'Rifa actualizada.')
  })

  test('el vendedor lee UN aviso con la fecha nueva, y quien guardó no recibe el suyo', async ({
    page,
  }) => {
    const mensaje = `Cambiaron las fechas de ${activaName}: ahora termina el 21 de diciembre de 2063.`

    await loginAs(page, ACCOUNTS.seller)
    await page
      .getByRole('button', { name: /^Novedades/ })
      .first()
      .click()
    const aviso = page.getByText(mensaje)
    await expect(aviso).toHaveCount(1)
    await expect(aviso).toBeVisible()

    await page.context().clearCookies()
    await loginAs(page, ACCOUNTS.owner)
    await page
      .getByRole('button', { name: /^Novedades/ })
      .first()
      .click()
    await expect(page.getByText(mensaje)).toHaveCount(0)
  })

  test('un borrador no anuncia ningún aviso al cambiar sus fechas', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/raffles/${borradorId}/edit`)
    await escribirFechaDeFin(page, '2063-12-21')
    await expect(page.getByText(RAFFLE_DATE_CHANGE_NOTICE)).toHaveCount(0)
    // Y la fecha sigue siendo la nueva: el formulario sí vio el cambio.
    await expect(page.getByLabel('Fecha de fin')).toHaveValue('2063-12-21')
  })
})
