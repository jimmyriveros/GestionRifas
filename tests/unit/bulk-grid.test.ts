/**
 * Las dos reglas de la rejilla de creacion masiva (auditoria visual, P1-C y P2-3).
 *
 * P2-3 — LA CANTIDAD NO SE RECORTA EN SILENCIO. Reproducido en el navegador
 * sobre la instancia local: escribiendo 5000 en «Cantidad (1 a 1000)», el campo
 * seguia mostrando 5000, el resultado decia «1000 fila(s)» y el boton «Guardar
 * 1000 boleta(s)», sin un solo aviso. La guia de redaccion prohibe corregir en
 * silencio un dato recien tecleado, asi que ahora se explica el limite y no se
 * genera hasta que la cantidad sea posible.
 *
 * P1-C — NO SE BORRA LO ESCRITO SIN PREGUNTAR. Tambien reproducido: con «1234»
 * en la fila 1, un segundo toque en «Generar filas» lo borraba sin dialogo, sin
 * aviso y sin deshacer.
 *
 * Se prueba la REGLA, no el render: es lo que puede romperse y lo que otras
 * pantallas reutilizarian.
 */
import { describe, expect, it } from 'vitest'

import {
  BULK_GRID_COPY,
  checkBulkQuantity,
  countFilledRows,
  regenerateWarning,
} from '@/features/tickets/bulk/grid'
import { BULK_TICKET_MAX, BULK_TICKET_MIN } from '@/lib/constants'

describe('la cantidad de la creacion masiva', () => {
  it('acepta una cantidad dentro del rango y devuelve ese mismo numero', () => {
    expect(checkBulkQuantity('50')).toEqual({ ok: true, quantity: 50 })
    expect(checkBulkQuantity(String(BULK_TICKET_MIN))).toEqual({
      ok: true,
      quantity: BULK_TICKET_MIN,
    })
    expect(checkBulkQuantity(String(BULK_TICKET_MAX))).toEqual({
      ok: true,
      quantity: BULK_TICKET_MAX,
    })
  })

  it('NO recorta al maximo: lo rechaza y explica el limite (P2-3)', () => {
    const resultado = checkBulkQuantity('5000')

    expect(resultado.ok).toBe(false)
    // Lo que importa: no devuelve `{ ok: true, quantity: 1000 }`. Si lo
    // hiciera, volveriamos al defecto: pedir 5000 y recibir 1000 sin saberlo.
    expect(resultado).toEqual({ ok: false, message: BULK_GRID_COPY.quantityTooMany })
    expect(BULK_GRID_COPY.quantityTooMany).toContain(String(BULK_TICKET_MAX))
  })

  it('rechaza por debajo del minimo, sin subirlo en silencio', () => {
    expect(checkBulkQuantity('0')).toEqual({ ok: false, message: BULK_GRID_COPY.quantityTooFew })
    expect(checkBulkQuantity('-5')).toEqual({ ok: false, message: BULK_GRID_COPY.quantityTooFew })
  })

  it('rechaza lo que no es un numero entero', () => {
    expect(checkBulkQuantity('abc')).toEqual({
      ok: false,
      message: BULK_GRID_COPY.quantityNotANumber,
    })
    expect(checkBulkQuantity('50,5')).toEqual({
      ok: false,
      message: BULK_GRID_COPY.quantityNotANumber,
    })
    expect(checkBulkQuantity('50.5')).toEqual({
      ok: false,
      message: BULK_GRID_COPY.quantityNotANumber,
    })
  })

  it('con el campo vacio no regana: no se puede generar, pero no hay error que contar', () => {
    expect(checkBulkQuantity('')).toEqual({ ok: false, message: null })
    expect(checkBulkQuantity('   ')).toEqual({ ok: false, message: null })
  })

  it('ningun mensaje deja a la persona sin saber que hacer', () => {
    for (const texto of ['5000', '0', 'abc']) {
      const resultado = checkBulkQuantity(texto)
      expect(resultado.ok).toBe(false)
      if (!resultado.ok) expect(resultado.message).not.toBeNull()
    }
  })
})

describe('el trabajo que se perderia al volver a generar', () => {
  const vacia = { dailyNumber: '', weeklyNumber: '' }

  it('no cuenta filas vacias: sin trabajo escrito no hay que preguntar nada', () => {
    expect(countFilledRows([])).toBe(0)
    expect(countFilledRows([vacia, vacia, vacia])).toBe(0)
    expect(countFilledRows([{ dailyNumber: '  ', weeklyNumber: '  ' }])).toBe(0)
  })

  it('cuenta una fila con cualquiera de los dos numeros escrito', () => {
    expect(countFilledRows([{ dailyNumber: '1234', weeklyNumber: '' }])).toBe(1)
    expect(countFilledRows([{ dailyNumber: '', weeklyNumber: '5678' }])).toBe(1)
    expect(countFilledRows([{ dailyNumber: '1234', weeklyNumber: '5678' }])).toBe(1)
  })

  it('cuenta solo las filas con algo, no todas las de la rejilla', () => {
    const rejilla = [vacia, { dailyNumber: '1', weeklyNumber: '' }, vacia, ...Array(20).fill(vacia)]
    expect(countFilledRows(rejilla)).toBe(1)
  })

  it('el aviso dice cuantas filas se pierden, con su singular y su plural', () => {
    expect(regenerateWarning(1)).toContain('1 fila.')
    expect(regenerateWarning(1)).not.toContain('1 filas')
    expect(regenerateWarning(8)).toContain('8 filas')
    // Y dice la consecuencia, que es lo que la pantalla no ensenaba.
    expect(regenerateWarning(8)).toContain('se borran')
  })

  it('el aviso nunca escribe «fila(s)»: esta pantalla ya arrastra ese defecto y no se amplia', () => {
    expect(regenerateWarning(1)).not.toContain('fila(s)')
    expect(regenerateWarning(9)).not.toContain('fila(s)')
  })
})

describe('los textos de la rejilla', () => {
  it('el titulo de la confirmacion nombra la accion, no pregunta «¿estás seguro?»', () => {
    expect(BULK_GRID_COPY.regenerateTitle).toBe('Volver a generar las filas')
    expect(BULK_GRID_COPY.regenerateTitle.toLowerCase()).not.toContain('seguro')
  })

  it('los botones nombran lo que hacen, nunca «Aceptar» ni «Listo»', () => {
    expect(BULK_GRID_COPY.regenerateConfirm).toBe('Generar de nuevo')
    expect(BULK_GRID_COPY.regenerateCancel).toBe('Cancelar')
    for (const texto of [BULK_GRID_COPY.regenerateConfirm, BULK_GRID_COPY.regenerateCancel]) {
      expect(texto).not.toMatch(/^(Aceptar|Listo|Enviar)$/)
    }
  })
})
