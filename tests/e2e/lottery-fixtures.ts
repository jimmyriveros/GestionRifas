import type { Page } from '@playwright/test'

import { serviceClient } from './db-setup'

/**
 * Programaciones y resultados de mentira para las pruebas del recuadro.
 *
 * Viven aparte porque los usan DOS suites —la de escritorio y la del
 * telefono— y duplicarlos habria dejado dos prefijos que limpiar y dos
 * versiones que mantener. Aqui no se crean COINCIDENCIAS: esas filas son
 * inmutables (trigger) y no se pueden borrar al terminar; el matching lo
 * cubren `tests/db`.
 */

/** Todas las filas de prueba lo llevan: es lo unico que se borra al terminar. */
export const LOTTERY_FIXTURE_PREFIX = 'E2E4-'

export type LotteryFixtureCode =
  'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'

export function todayBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export async function deleteFixtures(): Promise<void> {
  const svc = serviceClient()
  const { data } = await svc
    .from('lottery_draw_schedules')
    .select('id')
    .like('draw_number', `${LOTTERY_FIXTURE_PREFIX}%`)
  const ids = (data ?? []).map((row) => row.id)
  if (ids.length === 0) return
  const { error: resultError } = await svc.from('lottery_results').delete().in('schedule_id', ids)
  if (resultError) throw new Error(`No se pudieron borrar resultados E2E: ${resultError.message}`)
  const { error: scheduleError } = await svc.from('lottery_draw_schedules').delete().in('id', ids)
  if (scheduleError) {
    throw new Error(`No se pudieron borrar programaciones E2E: ${scheduleError.message}`)
  }
}

export async function insertSchedule(values: {
  lottery: LotteryFixtureCode
  draw: string
  referenceDate: string
  officialAt: string
  status?: 'scheduled' | 'completed' | 'rescheduled_later' | 'rescheduled_earlier'
}): Promise<string> {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('lottery_draw_schedules')
    .insert({
      lottery_code: values.lottery,
      draw_number: `${LOTTERY_FIXTURE_PREFIX}${values.draw}`,
      reference_date: values.referenceDate,
      original_scheduled_at: values.officialAt,
      official_scheduled_at: values.officialAt,
      schedule_status: values.status ?? 'scheduled',
      source_url:
        'https://cnjsa.coljuegos.gov.co/publicaciones/306418/cronograma-de-sorteos-ordinarios-y-extraordinarios/',
      source_authority: 'CNJSA',
      verified_at: values.officialAt,
    })
    .select('id')
    .single()
  if (error) throw new Error(`No se pudo crear la programacion E2E: ${error.message}`)
  return data.id
}

/**
 * Fila de resultado del sorteo. `pending` es una fuente que todavia no ha
 * publicado: hay fila porque se intento leerla, pero sin numero (BR-L05).
 */
export async function insertResult(
  scheduleId: string,
  winningNumber: string | null,
  series: string | null = null,
  status: 'pending' | 'confirmed' | 'conflict' | 'rejected' = 'confirmed',
) {
  const svc = serviceClient()
  const { error } = await svc.from('lottery_results').insert({
    schedule_id: scheduleId,
    winning_number: winningNumber,
    series,
    validation_status: status,
    source_url: 'https://loteriadelmeta.gov.co/resultados/',
    source_kind: 'official_page',
    confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
  })
  if (error) throw new Error(`No se pudo crear el resultado E2E: ${error.message}`)
}

/** El recuadro entero. */
export function card(page: Page) {
  return page.locator('[data-slot="lottery-results"]')
}

/** La tarjeta azul: el sorteo que todavia no tiene numero publicado (D-167). */
export function upcomingCard(page: Page) {
  return page.locator('[data-slot="lottery-draw-upcoming"]')
}

/** La tarjeta verde: la del numero mayor (D-167). */
export function resultCard(page: Page) {
  return page.locator('[data-slot="lottery-draw-result"]')
}

/* ---------------------------------------------------------------------------
 * La forma COMPACTA del recuadro, que es la que ve el vendedor (D-180).
 *
 * El portal administrativo sigue viendo las dos tarjetas grandes de entrada; el
 * vendedor ve dos filas y las despliega. Las dos formas comparten datos y
 * `data-slot="lottery-results"`, asi que `card(page)` vale para las dos.
 * ------------------------------------------------------------------------- */

/** La fila «Próxima» de la forma compacta. */
export function compactUpcomingRow(page: Page) {
  return page.locator('[data-slot="lottery-compact-upcoming"]')
}

/** La fila «Último resultado» de la forma compacta. */
export function compactResultRow(page: Page) {
  return page.locator('[data-slot="lottery-compact-result"]')
}

/** El boton «Ver detalle», arriba a la derecha de la tarjeta (D-181). */
export function detalleTrigger(page: Page) {
  return page.locator('[data-slot="lottery-detail-trigger"]')
}

/** El panel que se despliega encima del contenido (D-181). */
export function detallePanel(page: Page) {
  return page.locator('[data-slot="lottery-detail"]')
}

/**
 * Abre «Ver detalle» y espera a que el panel se vea de verdad.
 *
 * Desde D-181 no es un `<details>`: el panel se superpone al contenido y se
 * cierra al tocar fuera, asi que lo mueve un componente cliente. Se espera a
 * `toBeVisible` y no al atributo `open`, que ya no existe.
 */
export async function abrirDetalle(page: Page): Promise<void> {
  await detalleTrigger(page).click()
  await detallePanel(page).waitFor({ state: 'visible' })
}
