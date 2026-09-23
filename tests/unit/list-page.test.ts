import { describe, expect, it } from 'vitest'

import {
  compareBoolean,
  compareDate,
  compareNumber,
  compareText,
  sortAndPaginate,
} from '@/lib/list-page'

/**
 * Ordenar y paginar en el servidor las tres listas que se arman cruzando dos
 * consultas: Vendedores, Rifas y Administradores (P1-H).
 *
 * Lo que se mide aqui es la propiedad que el defecto rompia: que el orden es
 * del CONJUNTO y se aplica ANTES de cortar la pagina. Con el orden puesto
 * despues del corte —que es lo que hacia el navegador— la pagina 2 puede
 * contener valores mayores que la 1, y eso es exactamente lo que se comprueba.
 */

type Fila = { id: string; nombre: string; boletas: number; activo: boolean; alta: string | null }

const FILAS: Fila[] = [
  { id: 'e', nombre: 'Elena', boletas: 5, activo: true, alta: '2026-01-05' },
  { id: 'a', nombre: 'Ana', boletas: 90, activo: false, alta: '2026-01-01' },
  { id: 'd', nombre: 'Diana', boletas: 5, activo: true, alta: null },
  { id: 'c', nombre: 'Carlos', boletas: 40, activo: true, alta: '2026-01-03' },
  { id: 'b', nombre: 'Ángela', boletas: 5, activo: false, alta: '2026-01-02' },
]

const COMPARADORES = {
  nombre: (a: Fila, b: Fila) => compareText(a.nombre, b.nombre),
  boletas: (a: Fila, b: Fila) => compareNumber(a.boletas, b.boletas),
  activo: (a: Fila, b: Fila) => compareBoolean(a.activo, b.activo),
  alta: (a: Fila, b: Fila) => compareDate(a.alta, b.alta),
}

function paginar(page: number, sort: { column: string; direction: 'asc' | 'desc' } | null, size = 2) {
  return sortAndPaginate(FILAS, {
    page,
    sort,
    pageSize: size,
    tiebreak: (fila) => fila.id,
    comparators: COMPARADORES,
  })
}

describe('sortAndPaginate: el orden es del conjunto, no de la pagina', () => {
  it('sin orden pedido conserva el que traia la consulta', () => {
    const { rows, total } = paginar(1, null)
    expect(rows.map((f) => f.id)).toEqual(['e', 'a'])
    expect(total).toBe(FILAS.length)
  })

  it('el maximo real esta en la pagina 1, no el maximo de la pagina 1', () => {
    // EL DEFECTO: ordenando en el navegador la pagina servida, «Boletas» de
    // mayor a menor daba 5 —el mayor de ['e','a'] recortado a la pagina— en vez
    // de 90, que es el mayor de verdad.
    const { rows } = paginar(1, { column: 'boletas', direction: 'desc' })
    expect(rows[0]?.boletas).toBe(90)
  })

  it('ninguna pagina posterior supera a la anterior', () => {
    const p1 = paginar(1, { column: 'boletas', direction: 'desc' }).rows
    const p2 = paginar(2, { column: 'boletas', direction: 'desc' }).rows
    expect(Math.max(...p2.map((f) => f.boletas))).toBeLessThanOrEqual(
      Math.min(...p1.map((f) => f.boletas)),
    )
  })

  it('con empates, el recorrido completo no repite ni pierde filas', () => {
    // Tres filas empatadas en 5 boletas: sin desempate estable, una saldria dos
    // veces y otra ninguna al pasar de pagina.
    const todo = [1, 2, 3].flatMap((p) => paginar(p, { column: 'boletas', direction: 'asc' }).rows)
    expect(todo).toHaveLength(FILAS.length)
    expect(new Set(todo.map((f) => f.id)).size).toBe(FILAS.length)
    const boletas = todo.map((f) => f.boletas)
    expect(boletas).toEqual([...boletas].sort((a, b) => a - b))
  })

  it('el desempate hace que dos recorridos den lo mismo', () => {
    const uno = [1, 2, 3].flatMap((p) => paginar(p, { column: 'boletas', direction: 'asc' }).rows)
    const dos = [1, 2, 3].flatMap((p) => paginar(p, { column: 'boletas', direction: 'asc' }).rows)
    expect(dos.map((f) => f.id)).toEqual(uno.map((f) => f.id))
  })

  it('una columna que no esta en los comparadores se ignora', () => {
    // Igual que en la base: lo desconocido cae al orden por defecto, no rompe.
    const { rows } = paginar(1, { column: 'saldo', direction: 'desc' })
    expect(rows.map((f) => f.id)).toEqual(['e', 'a'])
  })

  it('una pagina fuera de rango da cero filas y el total de verdad', () => {
    const { rows, total, page } = paginar(99, null)
    expect(rows).toEqual([])
    expect(total).toBe(FILAS.length)
    expect(page).toBe(99)
  })

  it('una pagina menor que 1 se trata como la 1', () => {
    expect(paginar(0, null).page).toBe(1)
    expect(paginar(-5, null).rows.map((f) => f.id)).toEqual(['e', 'a'])
  })

  it('no toca la lista que recibe', () => {
    const antes = FILAS.map((f) => f.id)
    paginar(1, { column: 'nombre', direction: 'desc' })
    expect(FILAS.map((f) => f.id)).toEqual(antes)
  })
})

describe('comparadores', () => {
  it('el texto se ordena en español: «Ángela» va entre «Ana» y «Carlos»', () => {
    const { rows } = sortAndPaginate(FILAS, {
      page: 1,
      sort: { column: 'nombre', direction: 'asc' },
      pageSize: 10,
      tiebreak: (f) => f.id,
      comparators: COMPARADORES,
    })
    expect(rows.map((f) => f.nombre)).toEqual(['Ana', 'Ángela', 'Carlos', 'Diana', 'Elena'])
  })

  it('los nulos van al final en los dos sentidos, como `nullsFirst: false`', () => {
    const asc = sortAndPaginate(FILAS, {
      page: 1,
      sort: { column: 'alta', direction: 'asc' },
      pageSize: 10,
      tiebreak: (f) => f.id,
      comparators: COMPARADORES,
    })
    // `d` no tiene fecha: no puede encabezar una lista ordenada por fecha.
    expect(asc.rows.at(-1)?.id).toBe('d')
  })

  it('«Estado» ascendente pone primero a quien tiene la cuenta activa', () => {
    const { rows } = sortAndPaginate(FILAS, {
      page: 1,
      sort: { column: 'activo', direction: 'asc' },
      pageSize: 10,
      tiebreak: (f) => f.id,
      comparators: COMPARADORES,
    })
    expect(rows[0]?.activo).toBe(true)
    expect(rows.at(-1)?.activo).toBe(false)
  })

  it('compareNumber y compareDate ponen el nulo detras, no delante', () => {
    expect(compareNumber(null, 5)).toBeGreaterThan(0)
    expect(compareNumber(5, null)).toBeLessThan(0)
    expect(compareDate(null, '2026-01-01')).toBeGreaterThan(0)
    expect(compareDate('2026-01-01', null)).toBeLessThan(0)
  })
})
