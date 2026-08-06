import { afterEach, describe, expect, it } from 'vitest'

import {
  hasTextSelection,
  isActivationKey,
  shouldActivateRow,
} from '@/components/data/row-activation'

/**
 * Reglas de la fila seleccionable (CLAUDE.md §27): toda la fila abre el detalle,
 * pero un clic que ya hace algo no debe hacerlo dos veces.
 *
 * Se prueba la REGLA con nodos de jsdom, no el render de la tabla: lo que puede
 * romperse aqui es a quien se considera «zona libre» de la fila.
 */

/** Fila con una celda vacia, un enlace, una casilla y un boton, como las reales. */
function buildRow(): {
  row: HTMLTableRowElement
  free: HTMLElement
  link: HTMLAnchorElement
  checkbox: HTMLInputElement
  button: HTMLButtonElement
  badge: HTMLElement
} {
  document.body.innerHTML = `
    <table><tbody>
      <tr>
        <td><input type="checkbox" /></td>
        <td><a href="/owner/tickets/1">B-0001</a></td>
        <td><span id="free">1234 / 5678</span></td>
        <td><button type="button"><span id="badge">Ver</span></button></td>
      </tr>
    </tbody></table>
  `
  const row = document.querySelector('tr')!
  return {
    row,
    free: document.querySelector('#free')!,
    link: row.querySelector('a')!,
    checkbox: row.querySelector('input')!,
    button: row.querySelector('button')!,
    badge: document.querySelector('#badge')!,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('shouldActivateRow', () => {
  it('activa cuando el clic cae en una zona libre de la fila', () => {
    const { row, free } = buildRow()
    expect(shouldActivateRow(free, row)).toBe(true)
  })

  it('activa cuando el clic cae en la fila misma, entre celdas', () => {
    const { row } = buildRow()
    expect(shouldActivateRow(row, row)).toBe(true)
  })

  it('no activa sobre el enlace del código: ese clic ya navega', () => {
    const { row, link } = buildRow()
    expect(shouldActivateRow(link, row)).toBe(false)
  })

  it('no activa sobre la casilla de aprobación', () => {
    const { row, checkbox } = buildRow()
    expect(shouldActivateRow(checkbox, row)).toBe(false)
  })

  it('no activa sobre un botón de la fila', () => {
    const { row, button } = buildRow()
    expect(shouldActivateRow(button, row)).toBe(false)
  })

  it('no activa sobre el contenido de un botón, no solo sobre el botón', () => {
    const { row, badge } = buildRow()
    expect(shouldActivateRow(badge, row)).toBe(false)
  })

  it('no activa desde un menú en portal: React propaga el evento hasta la fila aunque el menú esté fuera', () => {
    const { row } = buildRow()
    const menuItem = document.createElement('div')
    menuItem.setAttribute('role', 'menuitem')
    document.body.append(menuItem) // fuera de la fila, como hace Radix

    expect(shouldActivateRow(menuItem, row)).toBe(false)
  })

  it('no activa cuando el objetivo no es un nodo', () => {
    const { row } = buildRow()
    expect(shouldActivateRow(null, row)).toBe(false)
  })

  it('activa aunque la tabla entera esté dentro de un elemento interactivo', () => {
    const { row, free } = buildRow()
    const wrapper = document.createElement('label')
    document.body.append(wrapper)
    wrapper.append(row.closest('table')!)

    // Lo que consume el clic tiene que estar DENTRO de la fila; por encima no cuenta.
    expect(shouldActivateRow(free, row)).toBe(true)
  })

  it('respeta la escotilla data-row-activation="ignore"', () => {
    const { row, free } = buildRow()
    free.setAttribute('data-row-activation', 'ignore')
    expect(shouldActivateRow(free, row)).toBe(false)
  })
})

describe('hasTextSelection', () => {
  it('sin selección no bloquea la apertura', () => {
    expect(hasTextSelection(null)).toBe(false)
    expect(hasTextSelection({ isCollapsed: true, toString: () => '' } as Selection)).toBe(false)
  })

  it('con texto seleccionado no se abre el detalle: el usuario estaba copiando', () => {
    expect(hasTextSelection({ isCollapsed: false, toString: () => '1234' } as Selection)).toBe(true)
  })

  it('una selección de solo espacios no cuenta como copiar', () => {
    expect(hasTextSelection({ isCollapsed: false, toString: () => '  ' } as Selection)).toBe(false)
  })
})

describe('isActivationKey', () => {
  it('abre con Enter y con Espacio', () => {
    expect(isActivationKey('Enter')).toBe(true)
    expect(isActivationKey(' ')).toBe(true)
    expect(isActivationKey('Spacebar')).toBe(true)
  })

  it('no abre con las teclas de navegación', () => {
    for (const key of ['Tab', 'ArrowDown', 'Escape', 'a']) {
      expect(isActivationKey(key)).toBe(false)
    }
  })
})
