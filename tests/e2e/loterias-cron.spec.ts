import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Route Handler del sincronizador (Etapa 5, D-148).
 *
 * El acto es la AUTORIZACION HTTP: sin secreto no corre. No descarga fuentes
 * oficiales. El cron de Vercel no se activa en esta etapa.
 */

test.describe('sincronizador de loterias — Route Handler', () => {
  test('sin secreto no redirige al login: responde 401', async ({ playwright, baseURL }) => {
    const contexto = await playwright.request.newContext({ baseURL })
    const respuesta = await contexto.get('/api/lottery/sync', { maxRedirects: 0 })
    expect(respuesta.status()).toBe(401)
    expect(respuesta.headers()['location'] ?? '').not.toContain('/login')
    const cuerpo = await respuesta.text()
    expect(cuerpo).toContain('No autorizado')
    expect(cuerpo).not.toMatch(/lottery_draw_schedules|service_role|SUPABASE/)
    await contexto.dispose()
  })

  test('un Bearer incorrecto no sincroniza', async ({ playwright, baseURL }) => {
    const contexto = await playwright.request.newContext({ baseURL })
    const respuesta = await contexto.get('/api/lottery/sync?probe=1', {
      maxRedirects: 0,
      headers: { Authorization: 'Bearer secreto-incorrecto-de-prueba' },
    })
    expect(respuesta.status()).toBe(401)
    const json = (await respuesta.json()) as { error?: string; probe?: boolean }
    expect(json.probe).toBeUndefined()
    expect(json.error).toBe('No autorizado.')
    await contexto.dispose()
  })

  test('una sesion de dueño no sustituye el secreto', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    const estado = await page.evaluate(async () => {
      const r = await fetch('/api/lottery/sync?probe=1')
      return r.status
    })
    expect(estado).toBe(401)
  })

  test('un secreto en la URL no autoriza', async ({ playwright, baseURL }) => {
    const contexto = await playwright.request.newContext({ baseURL })
    const respuesta = await contexto.get('/api/lottery/sync?secret=super-secreto-de-dieciseis', {
      maxRedirects: 0,
    })
    expect(respuesta.status()).toBe(401)
    await contexto.dispose()
  })
})
