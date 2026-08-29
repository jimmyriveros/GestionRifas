import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  allEligible,
  commonPriceRange,
  countEligible,
  ineligibleFor,
  whyNot,
  type BulkAction,
  type TicketEligibility,
} from '../../src/features/tickets/selection/eligibility'
import { DEFAULT_TICKET_PRICE } from '../../src/lib/constants'
import {
  emptySelection,
  readSelection,
  subscribeSelection,
  writeSelection,
} from '../../src/features/tickets/selection/selection-store'

/**
 * Las dos piezas puras de la seleccion multiple (BR-B01, D-082): que se puede
 * hacer con cada boleta y donde vive la lista de seleccionadas.
 *
 * Las REGLAS de elegibilidad estan en SQL y las prueba `tests/db/bulk-actions`.
 * Lo que se comprueba aqui es el resumen que ve la persona: los recuentos, la
 * lista de incompatibles y el motivo concreto de cada una.
 */

function boleta(overrides: Partial<TicketEligibility> = {}): TicketEligibility {
  return {
    ticketId: crypto.randomUUID(),
    dailyNumber: '1234',
    weeklyNumber: '5678',
    inventoryStatus: 'available',
    sellerId: crypto.randomUUID(),
    raffleId: crypto.randomUUID(),
    hasClient: false,
    hasActivePayments: false,
    hasPayments: false,
    raffleActive: true,
    can: { approve: false, assign: true, cancel: true, changeSeller: true, delete: true },
    // El precio se lee de la constante, no se escribe a mano: una cifra fija
    // aqui volveria a caerse el dia que cambie el precio (D-098). La mitad es
    // el suelo de quien no pertenece a un equipo (BR-G13).
    basePrice: DEFAULT_TICKET_PRICE,
    minSalePrice: DEFAULT_TICKET_PRICE / 2,
    ...overrides,
  }
}

describe('elegibilidad de las acciones masivas', () => {
  it('cuenta cuantas admiten cada accion', () => {
    const filas = [
      boleta(),
      boleta({
        can: { approve: false, assign: false, cancel: true, changeSeller: true, delete: false },
      }),
    ]

    expect(countEligible(filas, 'assign')).toBe(1)
    expect(countEligible(filas, 'cancel')).toBe(2)
    expect(countEligible(filas, 'delete')).toBe(1)
  })

  it('«todas» es falso con una sola que no puede', () => {
    const filas = [boleta(), boleta({ can: { ...boleta().can, cancel: false } })]

    expect(allEligible(filas, 'cancel')).toBe(false)
    expect(allEligible([boleta()], 'cancel')).toBe(true)
  })

  it('una lista vacia no habilita ninguna accion', () => {
    expect(allEligible([], 'cancel')).toBe(false)
  })

  it('separa las incompatibles para poder ensenarlas', () => {
    const mala = boleta({ can: { ...boleta().can, delete: false } })
    const filas = [boleta(), mala]

    expect(ineligibleFor(filas, 'delete')).toEqual([mala])
    expect(ineligibleFor(filas, 'cancel')).toEqual([])
  })
})

describe('por que no se puede', () => {
  const casos: { accion: BulkAction; fila: TicketEligibility; espera: RegExp }[] = [
    {
      accion: 'assign',
      fila: boleta({
        inventoryStatus: 'assigned',
        hasClient: true,
        can: { ...boleta().can, assign: false },
      }),
      espera: /vendida/i,
    },
    {
      accion: 'assign',
      fila: boleta({
        inventoryStatus: 'pending_approval',
        can: { ...boleta().can, assign: false },
      }),
      espera: /apruebe/i,
    },
    {
      accion: 'assign',
      fila: boleta({ raffleActive: false, can: { ...boleta().can, assign: false } }),
      espera: /rifa/i,
    },
    {
      accion: 'cancel',
      fila: boleta({ hasActivePayments: true, can: { ...boleta().can, cancel: false } }),
      espera: /abonos activos/i,
    },
    {
      accion: 'changeSeller',
      fila: boleta({ inventoryStatus: 'assigned', can: { ...boleta().can, changeSeller: false } }),
      espera: /vendida/i,
    },
    {
      accion: 'delete',
      fila: boleta({ inventoryStatus: 'cancelled', can: { ...boleta().can, delete: false } }),
      espera: /anulada/i,
    },
    {
      accion: 'delete',
      fila: boleta({ hasPayments: true, can: { ...boleta().can, delete: false } }),
      espera: /abonos/i,
    },
    {
      accion: 'approve',
      fila: boleta({ inventoryStatus: 'available', can: { ...boleta().can, approve: false } }),
      espera: /aprobada/i,
    },
  ]

  it.each(casos)('$accion: $espera', ({ accion, fila, espera }) => {
    expect(whyNot(fila, accion)).toMatch(espera)
  })

  it('no da explicacion cuando si se puede', () => {
    expect(whyNot(boleta(), 'cancel')).toBe('')
  })

  it('una boleta anulada explica que sus numeros quedan reservados (BR-N08)', () => {
    const anulada = boleta({
      inventoryStatus: 'cancelled',
      can: { ...boleta().can, delete: false },
    })
    expect(whyNot(anulada, 'delete')).toContain('reservados')
  })
})

describe('almacen de la seleccion', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    writeSelection('prueba', [])
  })

  it('guarda y devuelve la lista, en orden', () => {
    writeSelection('prueba', ['a', 'b', 'c'])
    expect(readSelection('prueba')).toEqual(['a', 'b', 'c'])
  })

  it('sobrevive a que se pierda la cache en memoria, leyendo del almacenamiento', () => {
    window.sessionStorage.setItem('rifas.ticket-selection:otra', JSON.stringify(['x', 'y']))
    expect(readSelection('otra')).toEqual(['x', 'y'])
  })

  it('devuelve siempre la MISMA referencia cuando no hay nada', () => {
    // `useSyncExternalStore` entra en bucle infinito si cada lectura crea un
    // array nuevo: esta prueba es la que protege de eso.
    expect(readSelection('vacia')).toBe(emptySelection())
    expect(readSelection('vacia')).toBe(readSelection('vacia'))
  })

  it('separa portales: la seleccion del vendedor no es la del administrador', () => {
    writeSelection('owner-tickets', ['uno'])
    writeSelection('seller-tickets', ['dos', 'tres'])

    expect(readSelection('owner-tickets')).toEqual(['uno'])
    expect(readSelection('seller-tickets')).toEqual(['dos', 'tres'])
  })

  it('avisa a quien este suscrito, y deja de hacerlo al darse de baja', () => {
    const aviso = vi.fn()
    const baja = subscribeSelection('prueba', aviso)

    writeSelection('prueba', ['a'])
    expect(aviso).toHaveBeenCalledTimes(1)

    baja()
    writeSelection('prueba', ['a', 'b'])
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('vaciar la seleccion borra la entrada del almacenamiento', () => {
    writeSelection('prueba', ['a'])
    writeSelection('prueba', [])

    expect(window.sessionStorage.getItem('rifas.ticket-selection:prueba')).toBeNull()
    expect(readSelection('prueba')).toEqual([])
  })

  it('ignora contenido corrupto en vez de tumbar la pantalla', () => {
    window.sessionStorage.setItem('rifas.ticket-selection:rota', 'esto no es json')
    expect(readSelection('rota')).toEqual([])

    window.sessionStorage.setItem('rifas.ticket-selection:rota2', JSON.stringify({ a: 1 }))
    expect(readSelection('rota2')).toEqual([])

    window.sessionStorage.setItem('rifas.ticket-selection:rota3', JSON.stringify(['ok', 7, null]))
    expect(readSelection('rota3')).toEqual(['ok'])
  })

  it('nunca guarda mas boletas que el tope de una operacion', () => {
    const muchas = Array.from({ length: 1200 }, (_, index) => `id-${index}`)
    window.sessionStorage.setItem('rifas.ticket-selection:tope', JSON.stringify(muchas))

    expect(readSelection('tope')).toHaveLength(1000)
  })
})

/**
 * El precio comun de un lote (BR-P09, D-099).
 *
 * Decide si el dialogo de venta puede ofrecer la casilla «Precio de venta». Un
 * lote sin precio comun no tiene un unico precio que proponer, y entonces no se
 * ofrece: cada boleta se vende al de su rifa.
 */
describe('precio comun de un lote de boletas', () => {
  it('sin boletas no hay precio que proponer', () => {
    expect(commonPriceRange([])).toBeNull()
  })

  it('devuelve el precio cuando todas coinciden', () => {
    const lote = [boleta(), boleta(), boleta()]

    expect(commonPriceRange(lote)).toEqual({
      basePrice: DEFAULT_TICKET_PRICE,
      minSalePrice: DEFAULT_TICKET_PRICE / 2,
    })
  })

  it('no propone precio si las boletas son de rifas con precios distintos', () => {
    const lote = [boleta(), boleta({ basePrice: 50_000, minSalePrice: 25_000 })]

    expect(commonPriceRange(lote)).toBeNull()
  })

  it('no propone precio si el limite difiere aunque el precio oficial coincida', () => {
    // Pasa de verdad: dos vendedores de la misma rifa con formas de pago
    // distintas —uno por tramos, otro a la mitad del precio— tienen suelos
    // distintos (BR-G13).
    const lote = [boleta(), boleta({ minSalePrice: DEFAULT_TICKET_PRICE - 20_000 })]

    expect(commonPriceRange(lote)).toBeNull()
  })
})
