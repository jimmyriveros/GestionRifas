import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { APP_CAPABILITIES, ROLE_DEFAULT_CAPABILITIES } from '@/lib/auth/capabilities'
import { SETTLEMENT_STATUS_LABELS, SETTLEMENT_STATUS_TONES } from '@/lib/constants'
import { SETTLEMENT_COPY, firstName } from '@/features/settlements/copy'
import type {
  SellerSettlementAccount,
  SettlementPrizeBase,
  SettlementTeamRow,
  StaffSettlementPrize,
} from '@/features/settlements/queries'
import {
  parseSettlementListFilters,
  parseSettlementRaffle,
  recordPrizePaymentSchema,
  recordTransferSchema,
  voidTransferSchema,
} from '@/features/settlements/schemas'
import {
  earningsHint,
  headCanVoidPrize,
  headPrizePayers,
  prizeAmount,
  prizeState,
  prizesSummary,
  staffCanVoidPrize,
  staffPrizePayers,
  teamPendingNotice,
} from '@/features/settlements/view'

/**
 * Cierre de cuentas (D-241): lo que se decide sin base de datos.
 *
 * Las reglas de dinero, quien confirma y la privacidad las prueba
 * `tests/db/settlements.test.ts` contra PostgreSQL; aqui van las frases que se
 * enseñan, los pagadores que se ofrecen y la forma de lo que llega del navegador.
 */

const UUID = '5b9d7c1e-2f4a-4c3b-9d8e-7a6f5e4d3c2b'
const CARLOS = '11111111-1111-4111-8111-111111111111'
const ANA = '22222222-2222-4222-8222-222222222222'

function premio(extra: Partial<StaffSettlementPrize> = {}): StaffSettlementPrize {
  return {
    matchId: UUID,
    prizeId: UUID,
    awardMissing: false,
    referenceDate: '2026-09-20',
    lotteryCode: 'bogota',
    drawNumber: '2840',
    dailyNumber: '1234',
    weeklyNumber: '5678',
    ticketSellerId: CARLOS,
    ticketSellerName: 'Carlos Ruiz',
    prizeTitle: 'Premio diario',
    knownAmount: 150_000,
    valuePending: false,
    resultConflict: false,
    numbersChanged: false,
    paymentId: null,
    payer: null,
    payerId: null,
    payerName: null,
    amount: null,
    valueWasPending: null,
    paidOn: null,
    confirmedByName: null,
    canRecord: true,
    inAccount: true,
    payerInAccount: false,
    parentId: null,
    parentName: null,
    ...extra,
  }
}

describe('Z-U1 — estados y capacidad', () => {
  it('las siete etiquetas de estado, y «Cerrada» es de la cuenta', () => {
    expect(SETTLEMENT_STATUS_LABELS).toEqual({
      no_activity: 'Sin boletas pagadas',
      missing_info: 'Falta información',
      pending: 'Pendiente',
      partial: 'Entrega parcial',
      in_favor: 'A favor del vendedor',
      to_close: 'Por cerrar',
      closed: 'Cerrada',
    })
    // Alguien tiene que actuar en cuatro de ellas; «A favor» es informativa.
    expect(SETTLEMENT_STATUS_TONES.in_favor).toBe('info')
    expect(SETTLEMENT_STATUS_TONES.closed).toBe('success')
    expect(SETTLEMENT_STATUS_TONES.missing_info).toBe('warning')
  })

  it('settlements.manage es del Dueño y del Administrador, nunca del vendedor', () => {
    expect(APP_CAPABILITIES).toContain('settlements.manage')
    expect(ROLE_DEFAULT_CAPABILITIES.owner).toContain('settlements.manage')
    expect(ROLE_DEFAULT_CAPABILITIES.admin).toContain('settlements.manage')
    expect(ROLE_DEFAULT_CAPABILITIES.seller).not.toContain('settlements.manage')
  })
})

describe('Z-U2 — los premios en pantalla', () => {
  it('ganado no es pagado; un resultado por verificar y un pago sin premio se distinguen', () => {
    expect(prizeState(premio(), false)).toBe('unpaid')
    expect(prizeState(premio({ resultConflict: true }), false)).toBe('conflict')
    expect(prizeState(premio({ awardMissing: true }), false)).toBe('missing')
    expect(prizeState(premio({ paymentId: UUID, payer: 'organization' }), false)).toBe('owner')
    expect(prizeState(premio({ paymentId: UUID, payer: 'seller', payerId: CARLOS }), true)).toBe(
      'discounted',
    )
    expect(prizeState(premio({ paymentId: UUID, payer: 'seller', payerId: ANA }), false)).toBe(
      'other',
    )
  })

  it('un valor desconocido nunca se escribe como $0 (BR-Z08)', () => {
    expect(prizeAmount(premio({ valuePending: true, knownAmount: null }))).toBeNull()
    expect(prizeAmount(premio({ valuePending: true, knownAmount: 2_000_000 }))).toBeNull()
    expect(prizeAmount(premio())).toBe(150_000)
    expect(prizeAmount(premio({ paymentId: UUID, amount: 900_000, valuePending: true }))).toBe(
      900_000,
    )
  })

  it('el resumen suma solo lo pagado', () => {
    const lista: SettlementPrizeBase[] = [
      premio({ paymentId: UUID, amount: 150_000 }),
      premio({ paymentId: UUID, amount: 100_000 }),
      premio(),
    ]
    expect(prizesSummary(lista)).toEqual({ count: 3, paid: 250_000 })
    // La cifra dice que es lo PAGADO: la lista enseña también el valor de un
    // premio sin pago, y un total que no suma su desglose lo tiene que decir (D-172).
    expect(SETTLEMENT_COPY.prizes.summary(3, 450_000)).toBe('3 premios · $450.000 pagados')
    expect(SETTLEMENT_COPY.prizes.summary(1, 150_000)).toBe('1 premio · $150.000 pagados')
  })

  it('el personal registra lo del vendedor directo, lo del vendedor a cargo y lo del dueño; nunca lo del integrante', () => {
    const cuenta = { sellerId: CARLOS, sellerName: 'Carlos Ruiz' }
    const propio = staffPrizePayers(premio(), cuenta)
    expect(propio.map((p) => [p.value, p.label])).toEqual([
      [CARLOS, 'Carlos Ruiz'],
      ['organization', 'El dueño'],
    ])
    expect(propio[0]!.effect).toBe(
      'Este valor se descontará de lo que Carlos entrega. Su ganancia no cambia.',
    )

    const deAna = staffPrizePayers(
      premio({ ticketSellerId: ANA, ticketSellerName: 'Ana Gómez', parentId: CARLOS }),
      cuenta,
    )
    expect(deAna.map((p) => p.value)).toEqual([CARLOS, 'organization'])
    expect(deAna.map((p) => p.value)).not.toContain(ANA)
    expect(deAna[0]!.effect).toBe(
      'Este valor se descontará de lo que Carlos entrega. La cuenta de Ana con Carlos no cambia.',
    )
  })

  it('el vendedor a cargo solo registra lo que pagó su integrante', () => {
    const opciones = headPrizePayers(premio({ ticketSellerId: ANA, ticketSellerName: 'Ana Gómez' }))
    expect(opciones).toEqual([
      {
        value: ANA,
        label: 'Ana Gómez',
        effect: 'Este valor se descontará de lo que Ana te entrega. Su ganancia no cambia.',
      },
    ])
  })

  it('anula quien podría registrarlo hoy (BR-Z14)', () => {
    const pagadoPorDueno = premio({ paymentId: UUID, payer: 'organization' })
    expect(staffCanVoidPrize(pagadoPorDueno, CARLOS)).toBe(true)
    const pagadoPorCarlos = premio({ paymentId: UUID, payer: 'seller', payerId: CARLOS })
    expect(staffCanVoidPrize(pagadoPorCarlos, CARLOS)).toBe(true)
    const pagadoPorAna = premio({
      paymentId: UUID,
      payer: 'seller',
      payerId: ANA,
      ticketSellerId: ANA,
      parentId: CARLOS,
    })
    expect(staffCanVoidPrize(pagadoPorAna, CARLOS)).toBe(false)
    expect(headCanVoidPrize(pagadoPorAna, ANA)).toBe(true)
    expect(headCanVoidPrize(pagadoPorCarlos, ANA)).toBe(false)
    expect(staffCanVoidPrize(premio(), CARLOS)).toBe(false)
  })
})

describe('Z-U3 — el equipo y la ganancia, en palabras', () => {
  const fila = (nombre: string, balance: number): SettlementTeamRow => ({
    memberId: UUID,
    memberName: nombre,
    memberActive: true,
    ticketsSold: 1,
    ticketsPaid: 1,
    totalDue: 0,
    delivered: 0,
    refunded: 0,
    balance,
    awardsUnpaid: 0,
    status: balance > 0 ? 'pending' : 'closed',
    changedAfterClose: false,
  })

  it('lo pendiente del equipo ya está dentro de la entrega al dueño', () => {
    expect(teamPendingNotice([fila('Ana Gómez', 500_000), fila('Luis Pérez', 0)])).toBe(
      'Los $500.000 pendientes de Ana ya están incluidos en tu entrega al dueño.',
    )
    expect(teamPendingNotice([fila('Ana Gómez', 500_000), fila('Luis Pérez', 90_000)])).toBe(
      'Los $590.000 que tu equipo todavía no te entrega ya están incluidos en tu entrega al dueño.',
    )
    // Un saldo a favor del integrante no se suma como pendiente.
    expect(teamPendingNotice([fila('Ana Gómez', -80_000)])).toBeNull()
  })

  it('la ganancia se explica sin inventar: por boleta, con rebajas o con equipo', () => {
    const base = {
      counterpartId: CARLOS,
      members: 0,
      holderRate: 20_000,
      ownTicketsPaid: 15,
      holderEarned: 300_000,
      holderTeamEarned: 0,
    } as SellerSettlementAccount
    expect(earningsHint(base)).toBe('$20.000 por cada boleta pagada.')
    expect(earningsHint({ ...base, holderEarned: 280_000 })).toBe(
      '$20.000 por cada boleta pagada, menos lo que rebajaste.',
    )
    expect(
      earningsHint({
        ...base,
        counterpartId: null,
        members: 2,
        holderEarned: 600_000,
        holderTeamEarned: 300_000,
      }),
    ).toBe('$600.000 por tus ventas y $300.000 por las de tu equipo.')
    expect(earningsHint({ ...base, ownTicketsPaid: 0 })).toBeUndefined()
  })

  it('los nombres cortos y los plurales', () => {
    expect(firstName('  Carlos Ruiz ')).toBe('Carlos')
    expect(SETTLEMENT_COPY.staffList.teamLine(0)).toBe('Solo sus ventas')
    expect(SETTLEMENT_COPY.staffList.teamLine(1)).toBe('Sus ventas y las de 1 integrante')
    expect(SETTLEMENT_COPY.staffList.paidCount(1, 1)).toBe('1 pagada de 1 vendida')
    expect(SETTLEMENT_COPY.tickets.unpaidOut(1)).toBe('La boleta sin pagar aún no entra.')
    expect(SETTLEMENT_COPY.tickets.includes(45, 20, 25)).toBe(
      'Esta cuenta incluye las 45 pagadas: 20 propias y 25 del equipo.',
    )
    expect(SETTLEMENT_COPY.staffList.metrics.closedHint(0)).toBe('No falta ninguna')
  })
})

describe('Z-U4 — lo que llega del navegador', () => {
  const entrega = {
    raffleId: UUID,
    sellerId: UUID,
    kind: 'delivery',
    amount: 2_300_000,
    receivedOn: '2026-09-30',
    expectedBalance: 2_300_000,
    requestId: UUID,
  }

  it('pesos enteros y mayores que cero, una fecha real y la solicitud', () => {
    expect(recordTransferSchema.safeParse(entrega).success).toBe(true)
    expect(
      recordTransferSchema.safeParse({ ...entrega, amount: 0 }).error?.issues[0]?.message,
    ).toBe('Escribe cuánto dinero recibiste.')
    expect(recordTransferSchema.safeParse({ ...entrega, amount: 10.5 }).success).toBe(false)
    expect(recordTransferSchema.safeParse({ ...entrega, receivedOn: '2026-02-31' }).success).toBe(
      false,
    )
    expect(recordTransferSchema.safeParse({ ...entrega, requestId: 'x' }).success).toBe(false)
    expect(recordTransferSchema.safeParse({ ...entrega, kind: 'transfer' }).success).toBe(false)
  })

  it('el pago del dueño no lleva pagador; el de un vendedor, sí', () => {
    const base = {
      raffleId: UUID,
      matchId: UUID,
      prizeId: UUID,
      paidOn: '2026-09-21',
      requestId: UUID,
    }
    expect(recordPrizePaymentSchema.safeParse({ ...base, payer: 'organization' }).success).toBe(
      true,
    )
    expect(
      recordPrizePaymentSchema.safeParse({ ...base, payer: 'seller', payerId: UUID }).success,
    ).toBe(true)
    expect(
      recordPrizePaymentSchema.safeParse({ ...base, payer: 'seller' }).error?.issues[0]?.message,
    ).toBe('Elige quién pagó el premio.')
    expect(
      recordPrizePaymentSchema.safeParse({ ...base, payer: 'organization', payerId: UUID }).success,
    ).toBe(false)
    expect(
      recordPrizePaymentSchema.safeParse({ ...base, payer: 'organization', amount: 0 }).error
        ?.issues[0]?.message,
    ).toBe('Escribe el valor del premio que se pagó.')
  })

  it('una anulación pide su motivo', () => {
    expect(
      voidTransferSchema.safeParse({ transferId: UUID, reason: 'no' }).error?.issues[0]?.message,
    ).toBe('Escribe el motivo de la anulación, de 5 a 500 caracteres.')
    expect(
      voidTransferSchema.safeParse({ transferId: UUID, reason: '  Error de digitación ' }).success,
    ).toBe(true)
  })

  it('los filtros de la URL ignoran lo corrupto', () => {
    expect(
      parseSettlementListFilters({ raffleId: 'x', status: 'raro', page: '-3', q: '  ' }),
    ).toEqual({
      raffleId: undefined,
      search: undefined,
      status: 'all',
      page: 1,
    })
    expect(
      parseSettlementListFilters({ raffleId: UUID, status: 'closed', q: 'Ana', page: '2' }),
    ).toEqual({
      raffleId: UUID,
      search: 'Ana',
      status: 'closed',
      page: 2,
    })
    expect(parseSettlementRaffle({ raffleId: [UUID, 'otra'] })).toBe(UUID)
    expect(parseSettlementRaffle({})).toBeUndefined()
  })
})

describe('Z-U5 — invariantes estructurales', () => {
  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')

  it('las pantallas del personal no leen nada del vendedor ni de sus clientes', () => {
    for (const ruta of [
      'src/app/(protected)/owner/settlements/page.tsx',
      'src/app/(protected)/owner/settlements/[sellerId]/page.tsx',
    ]) {
      const fuente = leer(ruta)
      expect(fuente, ruta).not.toMatch(/readSeller|seller_settlement|features\/clients|clientName/)
    }
  })

  it('la lectura del personal no declara cliente ni abonos', () => {
    const fuente = leer('src/features/settlements/queries.ts')
    const staff = fuente.slice(
      fuente.indexOf('export type StaffSettlementAccount'),
      fuente.indexOf('/** Una cuenta vista por su vendedor'),
    )
    expect(staff).not.toMatch(/client|partial/i)
    const staffPrize = fuente.slice(
      fuente.indexOf('export type StaffSettlementPrize'),
      fuente.indexOf('export type SellerSettlementPrize'),
    )
    expect(staffPrize).not.toMatch(/client/i)
  })

  it('ningún texto del módulo dice que el dinero se envió ni que un premio fue ganador', () => {
    // Solo los textos: los comentarios explican, justamente, que palabras se evitaron.
    const fuente = leer('src/features/settlements/copy.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(fuente).not.toMatch(/ganador|premiad|enviado|Registrar devoluci/i)
    // «Responsable» es el término de la propuesta; la aplicación dice «vendedor a cargo».
    expect(fuente).not.toMatch(/[Rr]esponsable/)
  })
})
