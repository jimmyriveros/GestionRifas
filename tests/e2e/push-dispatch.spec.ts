import { expect, test } from '@playwright/test'

import { ACCOUNTS, loginAs } from './fixtures'

/**
 * Route Handler del despachador de avisos (BR-V08, D-187, D-191).
 *
 * **Es el mismo juego de pruebas que el de loterías, reutilizado**, que es
 * literalmente lo que `TESTING` §4.8 escribió como criterio de aceptación antes
 * de construir nada: sin secreto no funciona, con uno corto tampoco, por la URL
 * tampoco, y una sesión —aunque sea la del Dueño— no sustituye al secreto.
 *
 * Esta suite **no configura el secreto** a propósito, igual que la de loterías:
 * lo que se prueba es que **falla cerrado**, que es la mitad que de verdad
 * importa. Un despachador abierto dejaría a cualquiera vaciar la cola de avisos
 * de toda la base. El camino contrario —con el secreto correcto vacía la cola—
 * se prueba donde se puede probar de verdad, contra la base y con el cifrado
 * real: `tests/db/push-dispatch.test.ts`.
 */

test.describe('despachador de avisos — Route Handler', () => {
  test('sin secreto no redirige al login: responde 401', async ({ playwright, baseURL }) => {
    const contexto = await playwright.request.newContext({ baseURL })
    const respuesta = await contexto.post('/api/push/dispatch', { maxRedirects: 0 })

    expect(respuesta.status()).toBe(401)
    // El proxy tiene que dejarlo pasar: si redirigiera, el cron de la base
    // recibiría un 307 y la cola no se vaciaría nunca.
    expect(respuesta.headers()['location'] ?? '').not.toContain('/login')

    const cuerpo = await respuesta.text()
    expect(cuerpo).toContain('No autorizado')
    // Y no cuenta nada de dentro.
    expect(cuerpo).not.toMatch(/push_outbox|push_subscriptions|service_role|VAPID|SUPABASE/)
    await contexto.dispose()
  })

  test('un Bearer incorrecto no despacha nada', async ({ playwright, baseURL }) => {
    const contexto = await playwright.request.newContext({ baseURL })
    const respuesta = await contexto.post('/api/push/dispatch?probe=1', {
      maxRedirects: 0,
      headers: { Authorization: 'Bearer secreto-incorrecto-de-prueba' },
    })

    expect(respuesta.status()).toBe(401)
    const json = (await respuesta.json()) as { error?: string; probe?: boolean }
    expect(json.probe).toBeUndefined()
    expect(json.error).toBe('No autorizado.')
    await contexto.dispose()
  })

  test('una sesión de dueño no sustituye el secreto', async ({ page }) => {
    // Un Route Handler NO hereda la guarda de su layout (D-060), así que esto
    // comprueba lo contrario de lo habitual: que tener sesión no sirve de nada.
    await loginAs(page, ACCOUNTS.owner)
    const estado = await page.evaluate(async () => {
      const r = await fetch('/api/push/dispatch?probe=1', { method: 'POST' })
      return r.status
    })
    expect(estado).toBe(401)
  })

  test('un secreto en la URL no autoriza', async ({ playwright, baseURL }) => {
    // Una query string acaba en los registros del servidor, en los del proxy y
    // en el historial. Que no se lea es media defensa (BR-V08).
    const contexto = await playwright.request.newContext({ baseURL })
    const respuesta = await contexto.post(
      '/api/push/dispatch?secret=super-secreto-de-dieciseis',
      { maxRedirects: 0 },
    )
    expect(respuesta.status()).toBe(401)
    await contexto.dispose()
  })

  test('el GET se comporta igual que el POST', async ({ playwright, baseURL }) => {
    // El cron de la base usa POST, pero una sonda de vida con GET tiene que dar
    // exactamente lo mismo: nada sin secreto.
    const contexto = await playwright.request.newContext({ baseURL })
    const respuesta = await contexto.get('/api/push/dispatch', { maxRedirects: 0 })
    expect(respuesta.status()).toBe(401)
    await contexto.dispose()
  })
})
