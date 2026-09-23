/**
 * La ordenación de una lista larga (P1-B).
 *
 * El defecto medido en local: `DataTable` ordenaba en el navegador las 25 filas
 * servidas y lo anunciaba con `aria-sort`. Ordenando «Abonado» de mayor a
 * menor, la pantalla daba $1.000 como máximo cuando el real eran $120.000; en
 * Pagos, $150.000 frente a $2.280.000.
 *
 * Aquí se prueba la REGLA: qué se acepta de la URL, qué se ignora y cómo cicla
 * la cabecera. Que la base ordene el conjunto entero lo comprueban las E2E.
 */
import { describe, expect, it } from 'vitest'

import { ariaSortFor, nextListSort, parseListSort } from '@/lib/list-sort'

const PERMITIDAS = ['name', 'createdAt', 'pendingAmount'] as const

describe('leer la ordenación de la URL', () => {
  it('acepta una columna permitida, con su sentido', () => {
    expect(parseListSort('name', 'asc', PERMITIDAS)).toEqual({ column: 'name', direction: 'asc' })
    expect(parseListSort('name', 'desc', PERMITIDAS)).toEqual({ column: 'name', direction: 'desc' })
  })

  it('sin columna no hay orden: manda el de la consulta', () => {
    expect(parseListSort(undefined, 'desc', PERMITIDAS)).toBeNull()
  })

  it('una columna que no está en la lista blanca se ignora, no revienta', () => {
    // Una URL vieja, un enlace compartido o alguien escribiendo a mano.
    expect(parseListSort('salePrice', 'desc', PERMITIDAS)).toBeNull()
    expect(parseListSort('', 'asc', PERMITIDAS)).toBeNull()
    expect(parseListSort('name; drop table', 'asc', PERMITIDAS)).toBeNull()
  })

  it('un sentido raro cae en ascendente, nunca en algo que no sea asc o desc', () => {
    expect(parseListSort('name', undefined, PERMITIDAS)?.direction).toBe('asc')
    expect(parseListSort('name', 'DESC', PERMITIDAS)?.direction).toBe('asc')
    expect(parseListSort('name', 'lo que sea', PERMITIDAS)?.direction).toBe('asc')
  })

  it('lo que devuelve SIEMPRE sale de la lista blanca, nunca del texto recibido', () => {
    const resultado = parseListSort('name', 'desc', PERMITIDAS)
    // Importa porque este valor acaba en un `order by`: se devuelve la constante
    // encontrada, no la cadena que llegó.
    expect(resultado && PERMITIDAS.includes(resultado.column)).toBe(true)
  })

  it('la lista blanca de una audiencia no abre la de otra', () => {
    // D-198: el personal no puede pedir orden por cliente ni por dinero.
    const DEL_PERSONAL = ['dailyNumber', 'raffleShortCode', 'sellerName'] as const
    for (const prohibida of ['clientName', 'salePrice', 'paidAmount', 'pendingAmount']) {
      expect(parseListSort(prohibida, 'desc', DEL_PERSONAL)).toBeNull()
    }
  })
})

describe('el ciclo de la cabecera', () => {
  it('primer toque ascendente, segundo descendente, tercero vuelve al de siempre', () => {
    const uno = nextListSort(null, 'name')
    expect(uno).toEqual({ column: 'name', direction: 'asc' })

    const dos = nextListSort(uno, 'name')
    expect(dos).toEqual({ column: 'name', direction: 'desc' })

    // Tres estados para que se pueda DESHACER sin tocar la URL a mano.
    expect(nextListSort(dos, 'name')).toBeNull()
  })

  it('cambiar de columna empieza de nuevo en ascendente', () => {
    const enNombre = { column: 'name', direction: 'desc' } as const
    expect(nextListSort(enNombre, 'createdAt')).toEqual({
      column: 'createdAt',
      direction: 'asc',
    })
  })
})

describe('lo que se anuncia', () => {
  it('solo la columna ordenada dice su sentido; las demás, «none»', () => {
    const orden = { column: 'name', direction: 'desc' } as const

    expect(ariaSortFor(orden, 'name')).toBe('descending')
    expect(ariaSortFor(orden, 'createdAt')).toBe('none')
    expect(ariaSortFor(null, 'name')).toBe('none')
    expect(ariaSortFor({ column: 'name', direction: 'asc' }, 'name')).toBe('ascending')
  })
})
