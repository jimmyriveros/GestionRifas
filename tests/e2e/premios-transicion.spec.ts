import { expect, test, type Page } from '@playwright/test'
import { Client as PgClient } from 'pg'

import {
  confirmedPrizeStarts,
  confirmedRafflePrizes,
  type TransitionPrizePayload,
} from '../../src/features/raffle-prizes/transition'
import type { Json } from '../../src/types/database.types'
import { loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs, unique } from './fixtures'

/**
 * Una rifa que ya existía, después de la transición a premios configurables
 * (Entrega 4, D-204).
 *
 * LA TRANSICIÓN NO TIENE PANTALLA, a propósito: la ejecuta un proceso con la
 * service role (`transition_raffle_prize_mode`). Por eso aquí es PREPARACIÓN, y
 * lo que se comprueba ocurre por la interfaz, con las sesiones reales: que el
 * panel y la revisión enseñan los seis premios confirmados a quien administra la
 * rifa, y que el vendedor recibe UN aviso en la campana.
 *
 * La rifa vive en 2071, que tiene el mismo calendario que 2026 —el 21 de
 * diciembre también es lunes—, así que los textos del calendario se leen igual
 * que se leerán en la rifa real y la prueba no caduca. Se borra entera al final.
 */

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
/** 2026 → 2071: el mismo calendario, día por día. */
const DESPLAZAMIENTO = 45

let refs: SeedRefs
let raffleId = ''
const raffleName = unique('E2E transición de premios')

function trasladar(premios: TransitionPrizePayload[]): TransitionPrizePayload[] {
  const anio = (fecha: string) => `${Number(fecha.slice(0, 4)) + DESPLAZAMIENTO}${fecha.slice(4)}`
  return premios.map((premio) => ({
    ...premio,
    rules: premio.rules.map((regla) => ({
      ...regla,
      start_date: anio(regla.start_date),
      end_date: anio(regla.end_date),
    })),
  }))
}

async function purgar(id: string): Promise<void> {
  if (!id) return
  const db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  try {
    await db.query('begin')
    await db.query(`set local session_replication_role = replica`)
    await db.query(
      `delete from notifications where kind = 'raffle_prize.changed' and (data ->> 'raffle_id')::uuid = $1`,
      [id],
    )
    await db.query(
      `delete from audit_logs where entity_id = $1
          or (entity_type = 'raffle_prize' and (coalesce(new_values, old_values) ->> 'raffle_id')::uuid = $1)`,
      [id],
    )
    await db.query(`delete from raffle_prize_transitions where raffle_id = $1`, [id])
    await db.query(
      `delete from raffle_prize_reward_options where version_id in (select id from raffle_prize_versions where raffle_id = $1)`,
      [id],
    )
    await db.query(
      `delete from raffle_prize_schedule_rules where version_id in (select id from raffle_prize_versions where raffle_id = $1)`,
      [id],
    )
    await db.query(`delete from raffle_prizes where raffle_id = $1`, [id])
    await db.query(`delete from raffle_prize_versions where raffle_id = $1`, [id])
    await db.query(`delete from raffles where id = $1`, [id])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  } finally {
    await db.end()
  }
}

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  const svc = serviceClient()

  const { data: raffle, error } = await svc
    .from('raffles')
    .insert({
      organization_id: refs.organizationId,
      name: raffleName,
      ticket_price: 120_000,
      start_date: '2071-08-03',
      end_date: '2071-12-31',
      created_by: refs.ownerId,
    })
    .select('id, prize_mode')
    .single()
  if (error) throw error
  expect(raffle.prize_mode).toBe('legacy')
  raffleId = raffle.id

  const activar = await svc.from('raffles').update({ status: 'active' }).eq('id', raffleId)
  if (activar.error) throw activar.error

  const premios = trasladar(
    confirmedRafflePrizes(
      confirmedPrizeStarts({
        draws: [],
        now: new Date('2026-09-01T08:00:00-05:00'),
        raffleStartDate: '2026-08-03',
      }),
    ),
  )

  const { data, error: transicionError } = await svc.rpc('transition_raffle_prize_mode', {
    p_organization_id: refs.organizationId,
    p_raffle_id: raffleId,
    p_expected_name: raffleName,
    p_expected_status: 'active',
    p_expected_start_date: '2071-08-03',
    p_expected_end_date: '2071-12-31',
    p_prizes: premios as unknown as Json,
    p_apply: true,
  })
  if (transicionError) throw transicionError
  expect(data).toMatchObject({ applied: true })
})

test.afterAll(async () => {
  await purgar(raffleId)
})

/** La tabla de premios: la cara de escritorio del listado (la de tarjetas está oculta). */
function prizesTable(page: Page) {
  return page.getByRole('table').first()
}

test.describe('Una rifa existente, después de la transición (D-204)', () => {
  test('el panel enseña los seis premios confirmados de la rifa activa', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/raffles/${raffleId}/prizes`)

    await expect(
      page.getByText(
        'Esta rifa está activa: lo que cambies aplica a los sorteos que todavía no se han jugado.',
      ),
    ).toBeVisible()

    const tabla = prizesTable(page)
    await expect(tabla.getByRole('row')).toHaveCount(7)
    for (const titulo of [
      'Premio diario',
      'Premio fin de semana',
      'Premio principal',
      'Premio especial de tres cifras',
      'Premio especial semanal',
      'Premio especial del 15 de diciembre',
    ]) {
      await expect(tabla).toContainText(titulo)
    }

    await expect(tabla).toContainText('$500.000')
    await expect(tabla).toContainText('$2.000.000')
    await expect(tabla).toContainText('$7.000.000')
    await expect(tabla).toContainText(
      'una de estas alternativas: Camioneta KIA, Renault Alaskan modelo 2023 y $20.000.000, $120.000.000 o Renault Logan Zen público modelo 2023 y $70.000.000',
    )
    await expect(tabla).toContainText('De lunes a viernes del 1 de septiembre al 27 de noviembre')
    await expect(tabla).toContainText('Los sábados del 5 de septiembre al 28 de noviembre')
    await expect(tabla).toContainText('Del 1 al 5 de diciembre y del 16 al 19 de diciembre')
    await expect(tabla).toContainText('Cruz Roja')
    await expect(tabla).toContainText('Boyacá')

    // Nada que diga que es la de siempre, y la acción de configurar sigue ahí.
    await expect(page.getByText('Esta rifa usa el sistema de premios de siempre')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Agregar premio' }).first()).toBeVisible()
  })

  test('la revisión dice que ya está activa, enseña los seis y no ofrece activarla otra vez', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/raffles/${raffleId}/review`)

    await expect(page.getByText('Esta rifa ya está activa.')).toBeVisible()
    await expect(page.getByText('Todavía no se puede activar')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Activar rifa' })).toBeDisabled()

    const tabla = prizesTable(page)
    await expect(tabla.getByRole('row')).toHaveCount(7)
    await expect(tabla).toContainText('Premio principal')
    await expect(tabla).toContainText('Premio especial de tres cifras')
  })

  test('el historial de un premio dice que lo publicó el sistema', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/raffles/${raffleId}/prizes`)

    await page.getByRole('button', { name: 'Historial' }).first().click()
    const historial = page.getByRole('dialog')
    await expect(historial.getByText('Versión 1')).toBeVisible()
    await expect(historial.getByText('Premio creado')).toBeVisible()
    await expect(historial.getByText(/· Por Sistema$/)).toBeVisible()
  })

  test('el vendedor recibe UN aviso en la campana, sin nada de la cartera', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page
      .getByRole('button', { name: /^Novedades/ })
      .first()
      .click()

    const aviso = page.getByText(
      `Cambiaron los premios de ${raffleName} para los próximos sorteos: ahora tiene 6 premios.`,
    )
    await expect(aviso).toHaveCount(1)
    await expect(aviso).toBeVisible()
  })
})
