// @vitest-environment node
/**
 * D-253: `safeNextPath`, el único validador del destino tras ingresar.
 *
 * Además de los casos escritos a mano, una propiedad: **todo** lo que acepta, resuelto como lo
 * resuelve el router de Next (`new URL(destino, dirección actual)`, `assignLocation`) y como un
 * navegador resuelve una cabecera `Location`, se queda en el mismo origen y en una ruta que empieza
 * por una sola barra. Se comprueba sobre todas las combinaciones de hasta cuatro caracteres
 * peligrosos delante de un dominio ficticio, codificaciones incluidas.
 */
import { describe, expect, it } from 'vitest'

import { safeNextPath } from '@/features/auth/safe-next-path'

const ORIGIN = 'https://gestion-rifas.test'
const CURRENT = `${ORIGIN}/login?next=algo`

describe('D-253: safeNextPath', () => {
  it.each([
    ['/', '/'],
    ['/seller/dashboard', '/seller/dashboard'],
    ['/reset-password', '/reset-password'],
    ['/owner/tickets?raffle=r-1&page=2', '/owner/tickets?raffle=r-1&page=2'],
    ['/seller/tickets#filtros', '/seller/tickets#filtros'],
    ['/seller/clients?q=Mar%C3%ADa', '/seller/clients?q=Mar%C3%ADa'],
    // Codificada, la barra invertida es un carácter más de la ruta: no sale del sitio.
    ['/%5Cevil.test', '/%5Cevil.test'],
    ['/%2F%2Fevil.test', '/%2F%2Fevil.test'],
    // Se devuelve normalizada, como la verá el navegador.
    ['/seller/../owner/dashboard', '/owner/dashboard'],
    ['/seller/clients?q=María', '/seller/clients?q=Mar%C3%ADa'],
  ])('acepta «%s» como «%s»', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })

  it.each([
    ['vacío', ''],
    ['sin barra inicial', 'seller/dashboard'],
    ['dominio suelto', 'evil.test'],
    ['dos barras', '//evil.test'],
    ['tres barras', '///evil.test'],
    ['barra invertida', '/\\evil.test'],
    ['barra invertida inicial', '\\/evil.test'],
    ['barra invertida doble', '/\\\\evil.test'],
    ['tabulador', '/\t/evil.test'],
    ['salto de línea', '/\n/evil.test'],
    ['retorno de carro', '/\r/evil.test'],
    ['nulo', '/\u0000/evil.test'],
    ['DEL', '/\u007f/evil.test'],
    ['espacio', '/ /evil.test'],
    ['espacio de no separación', '/ /evil.test'],
    ['separador de línea', '/ /evil.test'],
    ['dirección completa', 'https://evil.test/'],
    ['esquema relativo', 'http:evil.test'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,hola'],
    ['.. hasta dos barras', '/..//evil.test'],
    ['. hasta dos barras', '/.//evil.test'],
    ['demasiado largo', `/${'a'.repeat(2048)}`],
  ])('rechaza %s', (_, input) => {
    expect(safeNextPath(input)).toBeNull()
  })

  it.each([undefined, null, 0, true, {}, ['/seller/dashboard']])(
    'rechaza lo que no es texto: %j',
    (input) => {
      expect(safeNextPath(input)).toBeNull()
    },
  )

  it('lo que acepta nunca sale del sitio, en ninguna combinación de caracteres peligrosos', () => {
    const pieces = ['/', '\\', '\t', '\n', '\r', ' ', '.', '%5C', '%2F', '%09', '@', ':', '?', '#']
    const prefixes: string[] = ['']
    for (let length = 1; length <= 4; length += 1) {
      for (const prefix of prefixes.filter((p) => p.split('|').length === length)) {
        for (const piece of pieces) prefixes.push(`${prefix}|${piece}`)
      }
    }

    let accepted = 0
    for (const prefix of prefixes) {
      const candidate = `${prefix.split('|').join('')}evil.test/path`
      const result = safeNextPath(candidate)
      if (result === null) continue
      accepted += 1
      const landing = new URL(result, CURRENT)
      expect(landing.origin, `«${JSON.stringify(candidate)}» → «${result}»`).toBe(ORIGIN)
      expect(landing.pathname.startsWith('//'), `«${result}»`).toBe(false)
      // Y lo que devuelve es estable: volver a validarlo no lo cambia.
      expect(safeNextPath(result)).toBe(result)
    }
    // Que la propiedad no se cumpla en vacío: hay rutas internas entre las combinaciones.
    expect(accepted).toBeGreaterThan(100)
  })
})
