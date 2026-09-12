import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'

import { beforeEach, describe, expect, it } from 'vitest'

/**
 * Los oyentes `push` y `notificationclick` del service worker REAL
 * (BR-V04, BR-V05; D-187, D-190).
 *
 * **Se ejecuta `public/sw.js` tal cual**, no una copia ni un extracto: el
 * archivo se carga en un contexto de Node con un `self` de mentira y se le
 * disparan eventos de verdad. Si alguien edita el worker y rompe el texto de
 * reserva o la comprobación de origen, esto se cae.
 *
 * Por qué hace falta: el worker **no lo puede probar la suite E2E**. Solo se
 * registra en producción —en desarrollo se desregistra a propósito (D-116)— y
 * Playwright corre contra `next dev`. Sin este archivo, los ~100 renglones más
 * delicados del canal no tendrían ninguna prueba.
 */

type Handler = (event: unknown) => void

type Notificacion = { title: string; options: Record<string, unknown> }

type Mundo = {
  handlers: Map<string, Handler>
  notificaciones: Notificacion[]
  ventanas: { url: string; focused: boolean; navegadoA: string | null }[]
  abiertas: string[]
}

const ORIGEN = 'https://rifas.example.com'
const FUENTE = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8')

/** Carga el worker de verdad y devuelve con qué quedarse mirando. */
function cargarWorker(): Mundo {
  const mundo: Mundo = {
    handlers: new Map(),
    notificaciones: [],
    ventanas: [],
    abiertas: [],
  }

  const self = {
    location: { href: `${ORIGEN}/sw.js?v=prueba`, origin: ORIGEN },
    addEventListener: (tipo: string, handler: Handler) => {
      mundo.handlers.set(tipo, handler)
    },
    registration: {
      showNotification: (title: string, options: Record<string, unknown>) => {
        mundo.notificaciones.push({ title, options })
        return Promise.resolve()
      },
    },
    clients: {
      matchAll: () => Promise.resolve(mundo.ventanas.map((v) => ventanaFalsa(v))),
      openWindow: (url: string) => {
        mundo.abiertas.push(url)
        return Promise.resolve(null)
      },
    },
    skipWaiting: () => undefined,
  }

  function ventanaFalsa(v: (typeof mundo.ventanas)[number]) {
    return {
      url: v.url,
      focus: () => {
        v.focused = true
        return Promise.resolve()
      },
      navigate: (url: string) => {
        v.navegadoA = url
        return Promise.resolve()
      },
    }
  }

  const sandbox = {
    self,
    URL,
    Response,
    caches: { open: () => Promise.resolve({ match: () => Promise.resolve(undefined) }) },
    fetch: () => Promise.reject(new Error('sin red en la prueba')),
    console,
  }

  runInContext(FUENTE, createContext(sandbox))
  return mundo
}

/** Dispara un evento y espera a lo que el worker haya pasado a `waitUntil`. */
async function disparar(mundo: Mundo, tipo: string, evento: Record<string, unknown>) {
  const pendientes: Promise<unknown>[] = []
  const handler = mundo.handlers.get(tipo)
  if (!handler) throw new Error(`el worker no registró ningún oyente de «${tipo}»`)
  handler({ ...evento, waitUntil: (p: Promise<unknown>) => pendientes.push(p) })
  await Promise.all(pendientes)
}

function conCuerpo(payload: unknown) {
  return { data: { json: () => payload } }
}

let mundo: Mundo

beforeEach(() => {
  mundo = cargarWorker()
})

describe('el worker registra sus oyentes', () => {
  it('hay UN solo service worker y trae push y notificationclick', () => {
    expect(mundo.handlers.has('push')).toBe(true)
    expect(mundo.handlers.has('notificationclick')).toBe(true)
    // Y no perdió los de antes: esta sección se añadió AL FINAL, sin tocar nada.
    for (const previo of ['install', 'activate', 'fetch', 'message']) {
      expect(mundo.handlers.has(previo), previo).toBe(true)
    }
  })
})

describe('un aviso que llega al teléfono', () => {
  it('muestra el título y el cuerpo que manda el servidor', async () => {
    await disparar(
      mundo,
      'push',
      conCuerpo({ title: 'Rifas', body: 'Es hora de tu recordatorio.', url: '/seller/settings' }),
    )

    expect(mundo.notificaciones).toHaveLength(1)
    expect(mundo.notificaciones[0]!.title).toBe('Rifas')
    expect(mundo.notificaciones[0]!.options.body).toBe('Es hora de tu recordatorio.')
    expect(mundo.notificaciones[0]!.options.data).toEqual({
      url: `${ORIGEN}/seller/settings`,
    })
  })

  /**
   * La suscripción se pide con `userVisibleOnly`, que obliga a enseñar algo por
   * cada aviso recibido. Callarse haría que el navegador mostrara el suyo y, si
   * se repite, retirara el permiso.
   */
  it('SIN cuerpo se muestra igual, con el texto de reserva', async () => {
    await disparar(mundo, 'push', { data: null })

    expect(mundo.notificaciones).toHaveLength(1)
    expect(mundo.notificaciones[0]!.title).toBe('Rifas')
    expect(mundo.notificaciones[0]!.options.body).toBe('Tienes un aviso nuevo. Ábrelo para verlo.')
  })

  it('con un cuerpo ilegible, también', async () => {
    await disparar(mundo, 'push', {
      data: {
        json: () => {
          throw new Error('no es JSON')
        },
      },
    })
    expect(mundo.notificaciones).toHaveLength(1)
    expect(mundo.notificaciones[0]!.options.body).toBe('Tienes un aviso nuevo. Ábrelo para verlo.')
  })

  it('un título o un cuerpo larguísimos se recortan', async () => {
    await disparar(mundo, 'push', conCuerpo({ title: 'T'.repeat(300), body: 'B'.repeat(500) }))

    const { title, options } = mundo.notificaciones[0]!
    expect(title.length).toBeLessThanOrEqual(80)
    expect(String(options.body).length).toBeLessThanOrEqual(200)
    expect(title.endsWith('…')).toBe(true)
  })

  /**
   * El cuerpo viene cifrado desde nuestro propio servidor, pero una dirección se
   * comprueba antes de guardarla: un aviso no puede acabar llevando a un sitio
   * ajeno.
   */
  it('una dirección de otro origen NO se respeta', async () => {
    await disparar(mundo, 'push', conCuerpo({ url: 'https://sitio-ajeno.example/robar' }))
    expect(mundo.notificaciones[0]!.options.data).toEqual({ url: ORIGEN })
  })

  it('los avisos del mismo asunto se agrupan', async () => {
    await disparar(mundo, 'push', conCuerpo({ tag: 'recordatorio-de-pago' }))
    expect(mundo.notificaciones[0]!.options.tag).toBe('recordatorio-de-pago')
    // Y no vuelve a vibrar por uno que reemplaza a otro igual.
    expect(mundo.notificaciones[0]!.options.renotify).toBe(false)
  })
})

describe('al tocar el aviso', () => {
  it('trae al frente una ventana que ya estaba abierta, y no abre otra', async () => {
    mundo.ventanas.push({ url: `${ORIGEN}/seller/dashboard`, focused: false, navegadoA: null })

    await disparar(mundo, 'notificationclick', {
      notification: { close: () => undefined, data: { url: '/seller/settings/reminders' } },
    })

    expect(mundo.ventanas[0]!.focused).toBe(true)
    expect(mundo.ventanas[0]!.navegadoA).toBe(`${ORIGEN}/seller/settings/reminders`)
    expect(mundo.abiertas).toEqual([])
  })

  it('sin ninguna ventana abierta, abre una', async () => {
    await disparar(mundo, 'notificationclick', {
      notification: { close: () => undefined, data: { url: '/seller/settings/reminders' } },
    })
    expect(mundo.abiertas).toEqual([`${ORIGEN}/seller/settings/reminders`])
  })

  it('una ventana de otro origen no cuenta como ventana abierta', async () => {
    mundo.ventanas.push({ url: 'https://otro.example/algo', focused: false, navegadoA: null })

    await disparar(mundo, 'notificationclick', {
      notification: { close: () => undefined, data: { url: '/' } },
    })

    expect(mundo.ventanas[0]!.focused).toBe(false)
    expect(mundo.abiertas).toEqual([`${ORIGEN}/`])
  })
})

describe('lo que el worker sigue sin hacer', () => {
  /**
   * D-116 en una prueba: recibir avisos no cambia ni una coma de la regla de que
   * aquí no se guarda ni una respuesta con datos del negocio.
   */
  it('la sección de avisos no guarda nada en ninguna caché', () => {
    const seccion = FUENTE.slice(FUENTE.indexOf('NOTIFICACIONES DEL SISTEMA'))
    expect(seccion).not.toContain('caches.open')
    expect(seccion).not.toContain('cache.put')
  })

  it('no existe un segundo service worker en public/ (BR-V04)', () => {
    const sospechosos = readdirSync(join(process.cwd(), 'public')).filter(
      (f) => f.endsWith('.js') && /(^|-)sw\.js$|worker/i.test(f),
    )
    expect(sospechosos).toEqual(['sw.js'])
  })
})
