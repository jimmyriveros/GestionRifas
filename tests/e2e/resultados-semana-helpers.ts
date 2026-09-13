import { expect, type Locator, type Page } from '@playwright/test'

import { LOTTERY_CODES, type LotteryCode } from '../../src/features/lottery/constants'
import { WEEKLY_RESULTS_COPY } from '../../src/features/weekly-results/copy'
import {
  lastCompletedWeek,
  lotteryReferenceDate,
  type ResultsWeek,
} from '../../src/features/weekly-results/week'
import { serviceClient, type SeedRefs } from './db-setup'
import { deleteFixtures, insertResult, insertSchedule, todayBogota } from './lottery-fixtures'

/**
 * Preparación compartida de «Resultados de la semana» (D-194, D-197).
 *
 * La usan las dos suites —escritorio y teléfono—, igual que `catalogo-helpers`.
 * Es PREPARACIÓN con la service role: lo que cada prueba comprueba ocurre por la
 * interfaz y con la sesión real (docs/TESTING.md §2.1).
 *
 * Las programaciones llevan el prefijo de `lottery-fixtures` y se borran con su
 * `deleteFixtures`: no hay un segundo prefijo que limpiar.
 */

/** Números de prueba. Dos con ceros a la izquierda, que es lo que se quiere ver conservado. */
export const NUMEROS: Record<LotteryCode, string> = {
  cundinamarca: '2718',
  cruz_roja: '3141',
  meta: '0046',
  bogota: '1618',
  medellin: '5772',
  boyaca: '0007',
}

export const GRUPO = 'https://chat.whatsapp.com/AbCdEf123456'

/** La semana que enseña la pantalla hoy, calculada con la misma función que la aplicación. */
export function semanaDelResumen(): ResultsWeek {
  return lastCompletedWeek(todayBogota())
}

/**
 * Seis sorteos de la última semana terminada con su resultado confirmado, o
 * pendiente para las loterías que se indiquen.
 */
export async function montarSemana(
  opciones: { pendientes?: LotteryCode[] } = {},
): Promise<ResultsWeek> {
  await deleteFixtures()
  const week = semanaDelResumen()
  for (const code of LOTTERY_CODES) {
    const referenceDate = lotteryReferenceDate(week, code)
    const scheduleId = await insertSchedule({
      lottery: code,
      draw: `WR-${code}`,
      referenceDate,
      officialAt: `${referenceDate}T22:30:00-05:00`,
      status: 'completed',
    })
    if (opciones.pendientes?.includes(code)) await insertResult(scheduleId, null, null, 'pending')
    else await insertResult(scheduleId, NUMEROS[code])
  }
  return week
}

/** La rifa del catálogo del vendedor 1, sin tocar nada más de su configuración. */
export async function configurarRifaDelCatalogo(refs: SeedRefs, raffleId: string | null) {
  const { error } = await serviceClient()
    .from('memberships')
    .update({ public_raffle_id: raffleId })
    .eq('profile_id', refs.sellerId)
    .eq('organization_id', refs.organizationId)
  if (error) throw error
}

/** El grupo de WhatsApp del vendedor 1 (0050). */
export async function configurarGrupo(refs: SeedRefs, url: string | null) {
  const { error } = await serviceClient()
    .from('memberships')
    .update({ whatsapp_group_url: url })
    .eq('profile_id', refs.sellerId)
  if (error) throw error
}

export type MensajeGuardado = { usarPropio: boolean; texto: string | null }

/** El mensaje de «Resultados de la semana» del vendedor 1 (0056). */
export async function configurarMensaje(refs: SeedRefs, mensaje: MensajeGuardado) {
  const { error } = await serviceClient()
    .from('memberships')
    .update({
      weekly_results_use_custom_message: mensaje.usarPropio,
      weekly_results_custom_message: mensaje.texto,
    })
    .eq('profile_id', refs.sellerId)
  if (error) throw error
}

/** Lo que quedó guardado, leído de la base: la pantalla no puede ser su propia prueba. */
export async function leerMensaje(refs: SeedRefs): Promise<MensajeGuardado> {
  const { data, error } = await serviceClient()
    .from('memberships')
    .select('weekly_results_use_custom_message, weekly_results_custom_message')
    .eq('profile_id', refs.sellerId)
    .eq('organization_id', refs.organizationId)
    .single()
  if (error) throw error
  return {
    usarPropio: data.weekly_results_use_custom_message,
    texto: data.weekly_results_custom_message,
  }
}

/**
 * Deja la base como estaba: sin sorteos de prueba, sin rifa en el catálogo, sin
 * grupo y con el mensaje predeterminado.
 */
export async function desmontar(refs: SeedRefs) {
  await deleteFixtures()
  await configurarRifaDelCatalogo(refs, null)
  await configurarGrupo(refs, null)
  await configurarMensaje(refs, { usarPropio: false, texto: null })
}

export function resumen(page: Page): Locator {
  return page.locator('[data-slot="weekly-results-summary"]')
}

export function vistaPrevia(page: Page): Locator {
  return page.locator('[data-slot="weekly-results-preview"]')
}

export function fila(page: Page, code: LotteryCode): Locator {
  return resumen(page).locator(`[data-lottery="${code}"]`)
}

/** El interruptor «Usar mi propio mensaje». */
export function interruptorMensaje(page: Page): Locator {
  return page.getByRole('switch', { name: WEEKLY_RESULTS_COPY.share.messageToggle })
}

/** El área del mensaje, que nombra el título de su sección. */
export function campoMensaje(page: Page): Locator {
  return page.getByRole('textbox', { name: WEEKLY_RESULTS_COPY.share.messageTitle })
}

/** La vista previa del mensaje: lo que se copia y se comparte. */
export function vistaPreviaMensaje(page: Page): Locator {
  return page.locator('[data-slot="weekly-results-message"]')
}

/**
 * Espera a que la imagen esté en memoria.
 *
 * La primera petición de la suite paga la compilación de la ruta y de `next/og`
 * en `next dev`, que tarda varios segundos (I-075): por eso el plazo es largo.
 */
export async function esperarImagen(page: Page): Promise<void> {
  await expect(vistaPrevia(page)).toHaveAttribute('data-state', 'ready', { timeout: 90_000 })
}

/** Cuenta las peticiones al PNG que hace la página. */
export function contarPeticionesDeImagen(page: Page): () => number {
  let count = 0
  page.on('request', (request) => {
    if (request.url().includes('/api/weekly-results/image')) count += 1
  })
  return () => count
}

/** Firma y medidas de un PNG, leídas de su cabecera IHDR. */
export function medidasPng(bytes: Uint8Array): { width: number; height: number } {
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
