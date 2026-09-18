/**
 * «Premios ganados», la parte que no necesita base de datos (D-208, Etapa 2).
 *
 * Los filtros de la URL de cada portal, el valor de cada premio —qué es cierto y
 * qué sigue pendiente—, lo que el aviso de cobertura puede afirmar y el
 * vocabulario: ni «ganador» (BR-L15) ni «entregado» o «pagado», porque son
 * premios GANADOS. Lo que decide la base —qué filas y qué totales— lo prueba
 * `tests/db/prize-award-history.test.ts`.
 */
import { describe, expect, it } from 'vitest'

import {
  PRIZE_AWARDS_COPY,
  clientPrizeSummaryLine,
  coverageApplies,
  coverageNotice,
  outOfRangeDescription,
  prizeAwardDrawText,
  prizeAwardPlayedText,
  prizeAwardRewardText,
  prizeAwardValue,
  prizeAwardsDescription,
} from '@/features/prize-awards/copy'
import {
  parsePrizeAwardFilters,
  prizeAwardDatesReversed,
  prizeAwardHasFilters,
  prizeAwardsHref,
} from '@/features/prize-awards/schemas'
import { LIST_ITEM_LABELS } from '@/lib/constants'

const RIFA = '11111111-1111-4111-8111-111111111111'
const VENDEDOR = '22222222-2222-4222-8222-222222222222'
const CLIENTE = '33333333-3333-4333-8333-333333333333'

describe('los filtros de la URL, por portal', () => {
  it('P2-01: el vendedor acota por cliente y nunca por vendedor', () => {
    const filtros = parsePrizeAwardFilters(
      { raffleId: RIFA, sellerId: VENDEDOR, clientId: CLIENTE, dateFrom: '2026-09-01' },
      'seller',
    )
    expect(filtros).toEqual({
      raffleId: RIFA,
      sellerId: undefined,
      clientId: CLIENTE,
      dateFrom: '2026-09-01',
      dateTo: undefined,
      page: 1,
    })
  })

  it('P2-02: el personal acota por vendedor y un cliente en su dirección se descarta', () => {
    const filtros = parsePrizeAwardFilters(
      { sellerId: VENDEDOR, clientId: CLIENTE, page: '3' },
      'staff',
    )
    expect(filtros.sellerId).toBe(VENDEDOR)
    expect(filtros.clientId).toBeUndefined()
    expect(filtros.page).toBe(3)
  })

  it('P2-03: un valor corrupto se ignora en vez de romper la pantalla', () => {
    const filtros = parsePrizeAwardFilters(
      {
        raffleId: 'no-es-un-uuid',
        clientId: "1' or '1'='1",
        dateFrom: '2026-02-31',
        dateTo: 'ayer',
        page: '-4',
      },
      'seller',
    )
    expect(filtros).toEqual({
      raffleId: undefined,
      sellerId: undefined,
      clientId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      page: 1,
    })
    // Un valor repetido en la dirección toma el primero, como los reportes.
    expect(parsePrizeAwardFilters({ page: ['2', '9'] }, 'staff').page).toBe(2)
  })

  it('P2-04: unas fechas al revés se detectan; la página no cuenta como filtro', () => {
    expect(prizeAwardDatesReversed({ dateFrom: '2026-09-10', dateTo: '2026-09-01', page: 1 })).toBe(
      true,
    )
    expect(prizeAwardDatesReversed({ dateFrom: '2026-09-01', dateTo: '2026-09-01', page: 1 })).toBe(
      false,
    )
    expect(prizeAwardHasFilters({ page: 4 })).toBe(false)
    expect(prizeAwardHasFilters({ clientId: CLIENTE, page: 1 })).toBe(true)
  })

  it('P2-05: la dirección conserva los filtros, y la página 1 no se escribe', () => {
    expect(prizeAwardsHref('/seller/prizes', { clientId: CLIENTE })).toBe(
      `/seller/prizes?clientId=${CLIENTE}`,
    )
    expect(
      prizeAwardsHref('/owner/prizes', { sellerId: VENDEDOR, dateFrom: '2026-09-01', page: 1 }),
    ).toBe(`/owner/prizes?sellerId=${VENDEDOR}&dateFrom=2026-09-01`)
    expect(prizeAwardsHref('/owner/prizes', { raffleId: RIFA, page: 2 })).toBe(
      `/owner/prizes?raffleId=${RIFA}&page=2`,
    )
    expect(prizeAwardsHref('/seller/prizes', {})).toBe('/seller/prizes')
  })
})

describe('el valor de cada premio: qué es cierto y qué sigue pendiente (BR-J20)', () => {
  it('P2-06: un premio único en dinero es su importe, sin más', () => {
    expect(
      prizeAwardValue({ rewardMode: 'fixed', knownAmount: 500_000, valuePending: false }),
    ).toEqual({ main: '$500.000', detail: null, pending: false })
  })

  it('P2-07: unas alternativas no se suman ni se elige una', () => {
    expect(
      prizeAwardValue({ rewardMode: 'winner_choice', knownAmount: null, valuePending: true }),
    ).toEqual({
      main: 'Valor pendiente',
      detail: 'Se elige una de las alternativas.',
      pending: true,
    })
  })

  it('P2-08: dinero y algo en especie: el dinero es cierto, el valor completo no', () => {
    expect(
      prizeAwardValue({ rewardMode: 'fixed', knownAmount: 2_000_000, valuePending: true }),
    ).toEqual({
      main: '$2.000.000 en dinero',
      detail: 'Valor pendiente: también incluye un premio en especie.',
      pending: true,
    })
  })

  it('P2-09: un premio solo en especie no vale «$0»', () => {
    const valor = prizeAwardValue({ rewardMode: 'fixed', knownAmount: null, valuePending: true })
    expect(valor).toEqual({
      main: 'Valor pendiente',
      detail: 'Es un premio en especie.',
      pending: true,
    })
    expect(valor.main).not.toMatch(/\$0/)
  })

  it('P2-10: el origen declarado, sin modo, se lee por su recompensa', () => {
    // Con dinero: el importe declarado.
    expect(
      prizeAwardValue({ rewardMode: null, knownAmount: 500_000, valuePending: false }).main,
    ).toBe('$500.000')
    // En especie: pendiente, y sin inventarle un modo.
    expect(prizeAwardValue({ rewardMode: null, knownAmount: null, valuePending: true })).toEqual({
      main: 'Valor pendiente',
      detail: 'Es un premio en especie.',
      pending: true,
    })
  })

  it('P2-11: la recompensa se escribe solo cuando añade algo al valor', () => {
    // Solo dinero: ya lo dice el valor.
    expect(
      prizeAwardRewardText({
        rewardMode: 'fixed',
        rewardOptions: [{ position: 1, description: null, amount: 500_000 }],
      }),
    ).toBeNull()
    // Alternativas, separadas por «o»: se lleva UNA.
    expect(
      prizeAwardRewardText({
        rewardMode: 'winner_choice',
        rewardOptions: [
          { position: 1, description: 'Camioneta KIA', amount: null },
          { position: 2, description: null, amount: 120_000_000 },
          { position: 3, description: 'Renault Logan', amount: 70_000_000 },
        ],
      }),
    ).toBe('Una de estas alternativas: Camioneta KIA, $120.000.000 o Renault Logan y $70.000.000')
    // Algo en especie con su dinero, juntos con «y».
    expect(
      prizeAwardRewardText({
        rewardMode: null,
        rewardOptions: [{ position: 1, description: 'Moto AKT', amount: 2_000_000 }],
      }),
    ).toBe('Moto AKT y $2.000.000')
  })

  it('P2-12: el sorteo y el número que jugó, con sus ceros; las cifras solo si se conocen', () => {
    // El separador lleva un espacio de no separación delante (el punto nunca
    // abre una línea): se compara con espacios normales y se comprueba aparte.
    const llano = (texto: string) => texto.replaceAll('\u00a0', ' ')
    const sorteo = prizeAwardDrawText({ lotteryCode: 'bogota', drawNumber: '2862' })
    expect(llano(sorteo)).toBe('Bogotá · Sorteo 2862')
    expect(sorteo).toContain('\u00a0· ')
    expect(
      llano(
        prizeAwardPlayedText({
          matchField: 'daily_number',
          matchedNumber: '0046',
          prizeDigits: 'four',
        }),
      ),
    ).toBe('Número diario 0046 · Cuatro cifras')
    expect(
      llano(
        prizeAwardPlayedText({
          matchField: 'weekly_number',
          matchedNumber: '1427',
          prizeDigits: 'last_three',
        }),
      ),
    ).toBe('Número semanal 1427 · Últimas tres cifras')
    // Un premio reconocido no tiene versión: no se le inventan las cifras.
    expect(
      prizeAwardPlayedText({
        matchField: 'daily_number',
        matchedNumber: '3427',
        prizeDigits: null,
      }),
    ).toBe('Número diario 3427')
    // Detrás de «Jugó con», en la misma línea de la tabla, va en minúscula.
    expect(
      llano(
        prizeAwardPlayedText(
          { matchField: 'daily_number', matchedNumber: '0046', prizeDigits: 'four' },
          { inSentence: true },
        ),
      ),
    ).toBe('número diario 0046 · cuatro cifras')
  })
})

describe('la cobertura: solo lo que la consulta puede afirmar (BR-J22)', () => {
  const pendiente = {
    historyStart: '2026-08-09',
    pendingDraws: 13,
    pendingFrom: '2026-08-10',
    pendingTo: '2026-08-24',
  }

  // Las expectativas son FRASES ESCRITAS A MANO, no llamadas a otra función de
  // `copy.ts`: comparar el texto consigo mismo no demuestra que diga lo correcto
  // (Etapa 3, punto A).
  it('P2-13: dice cuántos, entre qué fechas CAEN, y que puede haber premios que no aparecen', () => {
    expect(coverageNotice(pendiente, false)).toBe(
      'Hay 13 sorteos ya jugados con el resultado sin confirmar o por verificar, entre el 10 y el 24 de agosto de 2026. Puede que esos sorteos tengan premios que no aparecen aquí.',
    )
    expect(
      coverageNotice(
        { ...pendiente, pendingDraws: 1, pendingFrom: '2026-08-24', pendingTo: '2026-08-24' },
        false,
      ),
    ).toBe(
      'Hay 1 sorteo ya jugado con el resultado sin confirmar o por verificar, el 24 de agosto de 2026. Puede que ese sorteo tenga premios que no aparecen aquí.',
    )
  })

  it('P2-14: con un filtro, aclara que la cuenta es de toda la organización', () => {
    expect(coverageNotice(pendiente, true)).toBe(
      'Hay 13 sorteos ya jugados con el resultado sin confirmar o por verificar, entre el 10 y el 24 de agosto de 2026. Puede que esos sorteos tengan premios que no aparecen aquí. La cuenta es de toda la organización, no solo de este filtro.',
    )
    // Nunca dice «cero premios» ni que el resto esté completo.
    expect(coverageNotice(pendiente, true)).not.toMatch(/cero|ningún premio|completo|cubierto/i)
  })

  it('P3-01: un resultado POR VERIFICAR no se presenta como «no sabemos si hubo premios»', () => {
    // El sorteo cuenta como pendiente también cuando su resultado entró en
    // conflicto después de confirmarse (`0069`), y ese sorteo puede tener ya un
    // premio en la lista. El aviso no puede negarlo: dice que el resultado está
    // por verificar y que PUEDE haber premios que no aparecen, no que no se sepa
    // si hubo alguno.
    const texto = coverageNotice(
      { ...pendiente, pendingDraws: 1, pendingFrom: '2026-09-03', pendingTo: '2026-09-03' },
      false,
    )
    expect(texto).toBe(
      'Hay 1 sorteo ya jugado con el resultado sin confirmar o por verificar, el 3 de septiembre de 2026. Puede que ese sorteo tenga premios que no aparecen aquí.',
    )
    expect(texto).not.toMatch(/no sabemos si hubo premios/i)
  })

  it('P3-02: no promete que lo demás esté completo, ni que confirmar lo complete', () => {
    for (const filtrado of [false, true]) {
      const texto = coverageNotice(pendiente, filtrado)
      // «Mientras tanto» prometía que, al confirmarse, se sabría: un sorteo del
      // sistema de siempre se confirma y su premio sigue necesitando que el
      // negocio lo reconozca (BR-J19).
      expect(texto).not.toMatch(/mientras tanto|todos los premios|completo|cubierto|del \d+ al/i)
      // «entre … y …», nunca «del … al …»: los sorteos CAEN en ese tramo, no lo llenan.
      expect(texto).toContain('entre el 10 y el 24 de agosto de 2026')
    }
  })

  it('P2-15: se calla cuando no hay pendientes o el filtro de fechas no toca el tramo', () => {
    expect(
      coverageApplies({ ...pendiente, pendingDraws: 0, pendingFrom: null, pendingTo: null }, {}),
    ).toBe(false)
    expect(coverageApplies(pendiente, {})).toBe(true)
    expect(coverageApplies(pendiente, { dateFrom: '2026-09-01' })).toBe(false)
    expect(coverageApplies(pendiente, { dateTo: '2026-08-09' })).toBe(false)
    expect(coverageApplies(pendiente, { dateFrom: '2026-08-20', dateTo: '2026-09-30' })).toBe(true)
  })
})

describe('los resúmenes y la cabecera', () => {
  it('P2-16: la ficha del cliente calla el dinero cuando es cero y lo pendiente cuando no hay', () => {
    // El separador lleva un espacio de no separación DELANTE: el punto nunca
    // abre una línea en el teléfono.
    const linea = (valores: Parameters<typeof clientPrizeSummaryLine>[0]) =>
      clientPrizeSummaryLine(valores).replaceAll('\u00a0', ' ')
    expect(linea({ prizes: 2, clients: 1, knownAmount: 1_000_000, valuePending: 0 })).toBe(
      '2 premios · $1.000.000 en dinero',
    )
    expect(linea({ prizes: 1, clients: 1, knownAmount: 0, valuePending: 1 })).toBe(
      '1 premio · 1 con valor pendiente',
    )
    expect(linea({ prizes: 3, clients: 1, knownAmount: 1_000_000, valuePending: 1 })).toBe(
      '3 premios · $1.000.000 en dinero · 1 con valor pendiente',
    )
    expect(
      clientPrizeSummaryLine({ prizes: 2, clients: 1, knownAmount: 1_000_000, valuePending: 0 }),
    ).toContain('\u00a0· ')
  })

  it('P2-17: la fecha de inicio sale de la base; sin ella, la frase no inventa una', () => {
    expect(prizeAwardsDescription('seller', '2026-08-09')).toBe(
      'Los premios que ganaron tus clientes desde el 9 de agosto de 2026. La entrega de los premios no se registra aquí.',
    )
    expect(prizeAwardsDescription('staff', null)).toBe(
      'Los premios que ganaron los clientes de tus vendedores. La entrega de los premios no se registra aquí.',
    )
  })

  it('P2-18: una página que no existe se explica con las cifras del conjunto', () => {
    expect(outOfRangeDescription(30, 2, true)).toBe(
      'Con estos filtros hay 30 premios en 2 páginas.',
    )
    expect(outOfRangeDescription(1, 1, false)).toBe('El historial tiene 1 premio en 1 página.')
  })

  it('P2-19: la paginación cuenta premios, en singular y en plural', () => {
    expect(LIST_ITEM_LABELS.prizes).toEqual({ one: 'premio', many: 'premios' })
  })
})

describe('el vocabulario (BR-L15, D-208)', () => {
  /** Todas las cadenas del módulo, recorridas en profundidad, más las frases que se componen. */
  function textos(): string[] {
    const salida: string[] = []
    const recorrer = (valor: unknown) => {
      if (typeof valor === 'string') salida.push(valor)
      else if (typeof valor === 'function') salida.push(String(valor('Ana Torres')))
      else if (valor && typeof valor === 'object') Object.values(valor).forEach(recorrer)
    }
    recorrer(PRIZE_AWARDS_COPY)
    salida.push(
      prizeAwardsDescription('seller', '2026-08-09'),
      prizeAwardsDescription('staff', '2026-08-09'),
      coverageNotice(
        {
          historyStart: '2026-08-09',
          pendingDraws: 2,
          pendingFrom: '2026-08-10',
          pendingTo: '2026-08-11',
        },
        true,
      ),
      prizeAwardValue({ rewardMode: 'winner_choice', knownAmount: null, valuePending: true })
        .detail ?? '',
      prizeAwardValue({ rewardMode: 'fixed', knownAmount: 1, valuePending: true }).detail ?? '',
      prizeAwardValue({ rewardMode: 'fixed', knownAmount: null, valuePending: true }).detail ?? '',
    )
    return salida
  }

  it('P2-20: nadie es «ganador», «ganadora» ni «premiada»', () => {
    for (const texto of textos()) {
      expect(texto, texto).not.toMatch(/ganador|ganadora|premiad[oa]/i)
    }
  })

  it('P2-21: son premios GANADOS: nada dice que se entregaron, se pagaron o se desembolsaron', () => {
    for (const texto of textos()) {
      // La única mención a la entrega es la que dice que NO se registra.
      if (texto.includes('no se registra')) continue
      expect(texto, texto).not.toMatch(/entregad|pagad|desembols/i)
    }
  })

  it('P2-22: el personal no lee «cliente» como un dato: solo como recuento o como grupo', () => {
    // «Clientes con premio» y «los clientes de tus vendedores» son grupos; ningún
    // texto del personal lleva un nombre, un teléfono ni un correo.
    expect(PRIZE_AWARDS_COPY.caption.staff).toBe(
      'Premios ganados por los clientes de tus vendedores',
    )
    expect(PRIZE_AWARDS_COPY.summary.clients).toBe('Clientes con premio')
  })
})
