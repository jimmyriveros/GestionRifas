import { expect, test, type Page } from '@playwright/test'

import { ALLOWED_SOURCE_HOSTS } from '../../src/features/lottery/sources'
import { ACCOUNTS, loginAs, logout } from './fixtures'
import { serviceClient } from './db-setup'

/**
 * Recuadro de resultados oficiales en el Panel (Etapa 4, D-147).
 *
 * El acto que se prueba es la PINTURA: el recuadro lee tablas locales. Las
 * coincidencias y el matching ya los cubren tests/db. Aqui no se crean
 * fotografias: no se pueden borrar (trigger inmutable).
 */

const PREFIX = 'E2E4-'

function todayBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

async function deleteFixtures(): Promise<void> {
  const svc = serviceClient()
  const { data } = await svc
    .from('lottery_draw_schedules')
    .select('id')
    .like('draw_number', `${PREFIX}%`)
  const ids = (data ?? []).map((row) => row.id)
  if (ids.length === 0) return
  const { error: resultError } = await svc.from('lottery_results').delete().in('schedule_id', ids)
  if (resultError) throw new Error(`No se pudieron borrar resultados E2E: ${resultError.message}`)
  const { error: scheduleError } = await svc.from('lottery_draw_schedules').delete().in('id', ids)
  if (scheduleError) {
    throw new Error(`No se pudieron borrar programaciones E2E: ${scheduleError.message}`)
  }
}

async function insertSchedule(values: {
  lottery: 'cundinamarca' | 'cruz_roja' | 'meta' | 'bogota' | 'medellin' | 'boyaca'
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
      draw_number: `${PREFIX}${values.draw}`,
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

async function insertConfirmed(scheduleId: string, winningNumber: string, series?: string) {
  const svc = serviceClient()
  const { error } = await svc.from('lottery_results').insert({
    schedule_id: scheduleId,
    winning_number: winningNumber,
    series: series ?? null,
    validation_status: 'confirmed',
    source_url: 'https://loteriadelmeta.gov.co/resultados/',
    source_kind: 'official_page',
    confirmed_at: new Date().toISOString(),
  })
  if (error) throw new Error(`No se pudo crear el resultado E2E: ${error.message}`)
}

function card(page: Page) {
  return page.locator('[data-slot="lottery-results"]')
}

function officialHostsOf(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (ALLOWED_SOURCE_HOSTS as readonly string[]).includes(host)
  } catch {
    return false
  }
}

test.describe('Resultados oficiales en el Panel', () => {
  test.afterEach(async () => {
    await deleteFixtures()
  })

  test('el recuadro aparece en los dos portales y no consulta webs oficiales', async ({
    page,
  }) => {
    const hits: string[] = []
    page.on('request', (request) => {
      if (officialHostsOf(request.url())) hits.push(request.url())
    })

    await loginAs(page, ACCOUNTS.owner)
    await expect(card(page).getByRole('heading', { name: 'Resultados oficiales' })).toBeVisible()

    await logout(page)
    await loginAs(page, ACCOUNTS.seller)
    await expect(card(page).getByRole('heading', { name: 'Resultados oficiales' })).toBeVisible()
    expect(hits, 'el Panel no debe consultar fuentes oficiales').toEqual([])
  })

  test('un resultado confirmado muestra el numero mayor con ceros y la serie', async ({
    page,
  }) => {
    const today = todayBogota()
    const scheduleId = await insertSchedule({
      lottery: 'meta',
      draw: `${today}-m`,
      referenceDate: today,
      officialAt: `${today}T22:50:00-05:00`,
      status: 'completed',
    })
    await insertConfirmed(scheduleId, '0046', '045')

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/dashboard')

    const recuadro = card(page)
    await expect(recuadro.getByRole('heading', { name: 'Meta' })).toBeVisible()
    await expect(recuadro.getByLabel('Número mayor 0046')).toBeVisible()
    await expect(recuadro.getByText('Serie informativa 045')).toBeVisible()
    await expect(recuadro.getByRole('heading', { name: 'Último resultado' })).toHaveCount(0)
    await expect(recuadro.getByRole('link', { name: 'Fuente oficial' })).toBeVisible()
  })

  test('un sorteo de hoy sin confirmar no se pinta como si ya hubiera resultado', async ({
    page,
  }) => {
    const today = todayBogota()
    const previous = addDays(today, -3)
    await insertSchedule({
      lottery: 'boyaca',
      draw: `${previous}-b`,
      referenceDate: previous,
      officialAt: `${previous}T22:50:00-05:00`,
      status: 'completed',
    }).then(async (id) => insertConfirmed(id, '0046'))

    await insertSchedule({
      lottery: 'meta',
      draw: `${today}-m`,
      referenceDate: today,
      officialAt: `${today}T01:00:00-05:00`,
    })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/dashboard')

    const recuadro = card(page)
    await expect(recuadro.getByRole('heading', { name: 'Meta' })).toBeVisible()
    await expect(recuadro.getByText('Resultado pendiente')).toBeVisible()
    await expect(recuadro.getByRole('heading', { name: 'Último resultado' })).toBeVisible()
    await expect(recuadro.getByLabel('Número mayor 0046')).toBeVisible()
    await expect(recuadro.getByRole('heading', { name: 'Boyacá' })).toBeVisible()
  })
})
