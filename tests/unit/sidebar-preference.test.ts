import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  isSidebarCollapsed,
  parseSidebarPreference,
  SIDEBAR_COOKIE,
  SIDEBAR_MIN_EXPANDED,
  SIDEBAR_ROOM_QUERY,
  sidebarCookie,
} from '@/components/layout/sidebar-preference'

/**
 * Como se combinan la preferencia de la persona y el sitio disponible (D-131).
 *
 * Se prueba aqui y no en el componente porque estas dos funciones son las que
 * deciden; la barra solo pinta lo que responden. Equivocarse no rompe ninguna
 * pantalla, produce dos molestias concretas: una barra abierta comiendose el
 * ancho de una tabla que no lo tiene, y una barra que se queda cerrada para
 * siempre porque un dia la ventana fue estrecha.
 */
describe('parseSidebarPreference', () => {
  it('abre la barra cuando no hay cookie', () => {
    expect(parseSidebarPreference(undefined)).toBe('expanded')
    expect(parseSidebarPreference(null)).toBe('expanded')
    expect(parseSidebarPreference('')).toBe('expanded')
  })

  it('respeta la unica preferencia que se guarda', () => {
    expect(parseSidebarPreference('collapsed')).toBe('collapsed')
    expect(parseSidebarPreference('expanded')).toBe('expanded')
  })

  /**
   * La cookie la escribe el navegador y cualquiera puede editarla a mano. Un
   * valor raro no puede dejar a nadie sin menu: se abre, que es lo de siempre.
   */
  it('trata cualquier otro valor como abierta', () => {
    expect(parseSidebarPreference('COLLAPSED')).toBe('expanded')
    expect(parseSidebarPreference('cerrada')).toBe('expanded')
    expect(parseSidebarPreference('1')).toBe('expanded')
  })
})

describe('isSidebarCollapsed', () => {
  it('respeta la preferencia cuando hay sitio', () => {
    expect(isSidebarCollapsed('expanded', true)).toBe(false)
    expect(isSidebarCollapsed('collapsed', true)).toBe(true)
  })

  /**
   * La restriccion manda en un solo sentido. Sin sitio se cierra aunque la
   * persona la quisiera abierta —esa es la queja que origino el trabajo: la
   * tabla comprimida—, pero la preferencia NO se borra: al volver a ensanchar
   * la ventana, la primera linea de esta prueba vuelve a aplicarse.
   */
  it('cierra la barra cuando no cabe, sin olvidar la preferencia', () => {
    expect(isSidebarCollapsed('expanded', false)).toBe(true)
    expect(isSidebarCollapsed('collapsed', false)).toBe(true)
  })

  /**
   * La superposicion (D-132) es la tercera situacion y gana a las otras dos: la
   * persona pulso el boton donde la barra no cabe, asi que se abre **encima**
   * del contenido y con sus nombres a la vista. Es lo contrario de lo que hacia
   * hasta el 2026-08-28, cuando el boton se quedaba inerte.
   */
  it('abre la barra cuando flota, aunque no quepa en su sitio', () => {
    expect(isSidebarCollapsed('expanded', false, true)).toBe(false)
    expect(isSidebarCollapsed('collapsed', false, true)).toBe(false)
  })

  /**
   * Y no cambia nada donde si cabe: ahi el boton guarda la preferencia y no
   * levanta ninguna capa, asi que este caso no deberia darse. Se prueba igual,
   * para que la regla sea una sola frase y no dependa de quien la llama.
   */
  it('la superposicion manda también cuando hay sitio', () => {
    expect(isSidebarCollapsed('collapsed', true, true)).toBe(false)
    expect(isSidebarCollapsed('expanded', true, false)).toBe(false)
  })

  it('sin superposicion se comporta como antes de D-132', () => {
    expect(isSidebarCollapsed('collapsed', true, false)).toBe(true)
    expect(isSidebarCollapsed('expanded', false, false)).toBe(true)
  })
})

describe('sidebarCookie', () => {
  it('guarda la preferencia en la raiz del sitio y por un ano', () => {
    const cookie = sidebarCookie('collapsed', true)
    expect(cookie).toContain(`${SIDEBAR_COOKIE}=collapsed`)
    expect(cookie).toContain('path=/')
    expect(cookie).toContain('max-age=31536000')
    expect(cookie).toContain('samesite=lax')
  })

  /**
   * `secure` en produccion si, en `http://localhost` no: el navegador
   * descartaria la cookie y la preferencia no se guardaria al desarrollar.
   */
  it('solo marca `secure` cuando la pagina va por HTTPS', () => {
    expect(sidebarCookie('expanded', true)).toContain('secure')
    expect(sidebarCookie('expanded', false)).not.toContain('secure')
  })
})

/**
 * El mismo ancho, escrito en dos sitios que TIENEN que coincidir: la consulta
 * de medios de `globals.css`, que decide lo que se ve, y la constante de
 * TypeScript, que decide si el boton puede abrirla. Si alguien cambia uno y se
 * olvida del otro, la barra se veria cerrada mientras el boton dice que esta
 * abierta. Esta prueba es el unico guardian posible: el CSS no se importa.
 */
describe('el punto de corte esta escrito una sola vez, aunque viva en dos archivos', () => {
  const globals = readFileSync(resolve(import.meta.dirname, '../../src/app/globals.css'), 'utf8')

  it('coincide con la consulta de medios de globals.css', () => {
    expect(globals).toContain(`@media (width < ${SIDEBAR_MIN_EXPANDED})`)
    expect(SIDEBAR_ROOM_QUERY).toBe(`(width >= ${SIDEBAR_MIN_EXPANDED})`)
  })

  /**
   * Las dos consultas son complementarias: `< 85rem` en el CSS y `>= 85rem` en
   * JavaScript. No puede haber un ancho en el que las dos digan que si.
   */
  it('no deja ningun ancho en tierra de nadie', () => {
    const cssBreakpoints = [...globals.matchAll(/@media \(width < ([\d.]+rem)\)/g)].map((m) => m[1])
    expect(cssBreakpoints).toContain(SIDEBAR_MIN_EXPANDED)
  })
})
