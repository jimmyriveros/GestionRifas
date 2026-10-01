import { afterEach, describe, expect, it } from 'vitest'

import { onRouterTransitionStart } from '@/instrumentation-client'
import {
  leavesPage,
  notifyNavigationStart,
  subscribeNavigationStart,
  type NavigationStartType,
} from '@/lib/navigation-start'

/**
 * El aviso de que el router empieza una navegación (D-245, I-199).
 *
 * Es lo que permite a `useUrlSearch` descartar la búsqueda pendiente ANTES de
 * que llegue la pantalla nueva. Lo que se prueba aquí es la parte pura: que el
 * aviso llega, a quién, con qué dirección, y cuándo una navegación sale de la
 * pantalla. El recorrido completo —escribir y pulsar una fila con la respuesta
 * retrasada— lo prueba `busqueda-navegacion.spec.ts`.
 */

const ORIGEN = window.location.origin
const desuscribir: Array<() => void> = []

afterEach(() => {
  while (desuscribir.length) desuscribir.pop()!()
})

function escuchar() {
  const llamadas: Array<{ url: string; type: NavigationStartType }> = []
  desuscribir.push(subscribeNavigationStart((url, type) => llamadas.push({ url: url.href, type })))
  return llamadas
}

describe('notifyNavigationStart', () => {
  it('avisa con la dirección completa, resuelta contra la página actual', () => {
    const llamadas = escuchar()
    notifyNavigationStart('/owner/settlements/abc?raffleId=r1', 'push')
    expect(llamadas).toEqual([{ url: `${ORIGEN}/owner/settlements/abc?raffleId=r1`, type: 'push' }])
  })

  it('deja de avisar a quien se desuscribe', () => {
    const llamadas: string[] = []
    const fin = subscribeNavigationStart((url) => llamadas.push(url.pathname))
    notifyNavigationStart('/a', 'push')
    fin()
    notifyNavigationStart('/b', 'push')
    expect(llamadas).toEqual(['/a'])
  })

  it('sin nadie escuchando no hace nada', () => {
    expect(() => notifyNavigationStart('/a', 'replace')).not.toThrow()
  })
})

describe('onRouterTransitionStart (instrumentation-client)', () => {
  it('reenvía a quien escucha cada inicio de navegación del router, con su tipo', () => {
    const llamadas = escuchar()
    onRouterTransitionStart('/seller/clients/c1', 'push')
    onRouterTransitionStart(`${ORIGEN}/seller/clients?q=an`, 'replace')
    onRouterTransitionStart(`${ORIGEN}/owner/dashboard`, 'traverse')
    expect(llamadas).toEqual([
      { url: `${ORIGEN}/seller/clients/c1`, type: 'push' },
      { url: `${ORIGEN}/seller/clients?q=an`, type: 'replace' },
      { url: `${ORIGEN}/owner/dashboard`, type: 'traverse' },
    ])
  })

  it('un fallo de quien escucha no se queda callado en el módulo', () => {
    // Next aísla los errores de este gancho (`router-transition.js`): un
    // listener que falla no rompe la navegación. Aquí solo se comprueba que el
    // error sube hasta ese aislamiento en vez de perderse.
    desuscribir.push(
      subscribeNavigationStart(() => {
        throw new Error('roto')
      }),
    )
    expect(() => onRouterTransitionStart('/a', 'push')).toThrow('roto')
  })
})

describe('leavesPage', () => {
  const url = (ruta: string) => new URL(ruta, ORIGEN)

  it('otra ruta: sí sale', () => {
    expect(
      leavesPage(url('/owner/settlements/abc?raffleId=r1'), 'push', '/owner/settlements'),
    ).toBe(true)
    expect(leavesPage(url('/seller/tickets/t1'), 'push', '/seller/tickets')).toBe(true)
  })

  it('la misma ruta con otros parámetros —un filtro, la página, el orden, la propia búsqueda—: no sale', () => {
    expect(
      leavesPage(url('/owner/settlements?raffleId=r1&status=closed'), 'push', '/owner/settlements'),
    ).toBe(false)
    expect(leavesPage(url('/seller/clients?page=2'), 'push', '/seller/clients')).toBe(false)
    expect(leavesPage(url('/seller/tickets?q=12'), 'replace', '/seller/tickets')).toBe(false)
  })

  it('Atrás o Adelante: sale siempre, también a la misma ruta', () => {
    expect(leavesPage(url('/owner/dashboard'), 'traverse', '/owner/settlements')).toBe(true)
    expect(
      leavesPage(url('/owner/settlements?status=open'), 'traverse', '/owner/settlements'),
    ).toBe(true)
  })

  it('otro origen: sale', () => {
    expect(leavesPage(new URL('https://wa.me/573001234567'), 'push', '/catalogo/ana')).toBe(true)
  })

  it('compara la ruta normalizada: con o sin codificar es la misma pantalla', () => {
    expect(leavesPage(url('/catalogo/jos%C3%A9?page=2'), 'push', '/catalogo/josé')).toBe(false)
  })
})
