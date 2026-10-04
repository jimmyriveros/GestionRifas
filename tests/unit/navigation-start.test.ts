import { afterEach, describe, expect, it } from 'vitest'

import { onRouterTransitionStart } from '@/instrumentation-client'
import {
  leavesPage,
  notifyNavigationStart,
  searchParamsToBuildOn,
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

/**
 * I-200 (D-252): la dirección sobre la que se construye un orden, un filtro o una página.
 *
 * Next no cambia `window.location` hasta que la pantalla nueva llega (medido en el navegador), así que aquí «llegó»
 * se simula moviendo la dirección con `history.pushState`, como lo haría el router al terminar.
 */
describe('searchParamsToBuildOn', () => {
  const pintada = (search: string) => new URLSearchParams(search)

  afterEach(() => {
    window.history.replaceState(null, '', '/')
    notifyNavigationStart(`${ORIGEN}/`, 'traverse') // olvida lo pedido
  })

  it('sin nada en camino, parte de lo pintado', () => {
    window.history.replaceState(null, '', '/seller/tickets?sort=clientName')
    notifyNavigationStart(`${ORIGEN}/`, 'traverse')
    expect(searchParamsToBuildOn('/seller/tickets', pintada('sort=clientName')).toString()).toBe(
      'sort=clientName',
    )
  })

  it('con una búsqueda de esta pantalla en camino, parte de ella: lo elegido no la pisa', () => {
    window.history.replaceState(null, '', '/seller/tickets')
    notifyNavigationStart('/seller/tickets?q=03', 'replace')
    const base = searchParamsToBuildOn('/seller/tickets', pintada(''))
    base.set('sort', 'clientName')
    expect(base.toString()).toBe('q=03&sort=clientName')
  })

  it('encadena: lo elegido mientras lo anterior sigue en camino parte de lo último pedido', () => {
    window.history.replaceState(null, '', '/seller/clients')
    notifyNavigationStart('/seller/clients?q=An', 'replace')
    notifyNavigationStart('/seller/clients?q=An&archived=1', 'push')
    expect(searchParamsToBuildOn('/seller/clients', pintada('')).toString()).toBe('q=An&archived=1')
  })

  it('cuando llegó —la dirección ya cambió—, vuelve a lo pintado, aunque el servidor haya redirigido a otra', () => {
    window.history.replaceState(null, '', '/seller/tickets')
    notifyNavigationStart('/seller/tickets?q=03', 'replace')
    window.history.pushState(null, '', '/seller/tickets?q=03&page=1')
    expect(searchParamsToBuildOn('/seller/tickets', pintada('q=03&page=1')).toString()).toBe(
      'q=03&page=1',
    )
  })

  it('lo que va a otra pantalla, Atrás/Adelante u otro origen no cuentan: lo pintado', () => {
    window.history.replaceState(null, '', '/seller/tickets?q=1')
    notifyNavigationStart('/seller/tickets/t1', 'push')
    expect(searchParamsToBuildOn('/seller/tickets', pintada('q=1')).toString()).toBe('q=1')

    notifyNavigationStart('/seller/tickets?q=9', 'traverse')
    expect(searchParamsToBuildOn('/seller/tickets', pintada('q=1')).toString()).toBe('q=1')

    notifyNavigationStart('https://wa.me/573001234567?text=hola', 'push')
    expect(searchParamsToBuildOn('/seller/tickets', pintada('q=1')).toString()).toBe('q=1')
  })

  it('devuelve una copia: tocarla no cambia lo pedido ni lo pintado', () => {
    window.history.replaceState(null, '', '/seller/tickets')
    notifyNavigationStart('/seller/tickets?q=03', 'replace')
    const pintado = pintada('')
    searchParamsToBuildOn('/seller/tickets', pintado).set('page', '2')
    expect(searchParamsToBuildOn('/seller/tickets', pintado).toString()).toBe('q=03')
    expect(pintado.toString()).toBe('')
  })
})
