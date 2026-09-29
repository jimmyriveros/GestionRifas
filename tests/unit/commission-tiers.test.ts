import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { firstTicketRate, tierListOrigin, type Agreement } from '@/features/commissions/agreement'
import { rowRangeText } from '@/features/commissions/components/TierListEditor'
import { EARNINGS_COPY, joinList, paidTicketsPhrase } from '@/features/commissions/copy'
import {
  saveCommissionTemplateSchema,
  sellerAgreementFormSchema,
  setSellerAgreementSchema,
} from '@/features/commissions/schemas'
import {
  fromDbTiers,
  hasTierProblems,
  sameTiers,
  TIER_LIMITS,
  TIER_MESSAGES,
  tierListSchema,
  tierProblems,
  tierRanges,
  toDbTiers,
  type EditableTier,
} from '@/features/commissions/tiers'
import { createTeamMemberSchema } from '@/features/team/schemas'
import { createUserSchema, userDialogSchema } from '@/features/users/schemas'
import { formatCOP } from '@/lib/money'

/**
 * La configuracion de ganancias, en lo que tiene de puro (D-237, BR-G29,
 * BR-G32): la validacion de una lista, el «hasta» derivado, como se lee un
 * acuerdo, los esquemas de las acciones y que los mensajes sean los de la base.
 *
 * El COMPORTAMIENTO del dinero no se prueba aqui: vive en PostgreSQL y lo prueba
 * `tests/db/earning-agreements.test.ts`.
 */

const LISTA = [
  { minTickets: 1, rate: 30_000 },
  { minTickets: 21, rate: 40_000 },
  { minTickets: 51, rate: 50_000 },
]

const SELLER = '11111111-1111-4111-8111-111111111111'

describe('tierProblems: la lista, como la valida la base (BR-G32)', () => {
  it('una lista bien escrita no tiene problemas', () => {
    expect(hasTierProblems(tierProblems(LISTA))).toBe(false)
  })

  it('vacia y con demasiados tramos son problemas de la lista entera', () => {
    expect(tierProblems([]).list).toBe(TIER_MESSAGES.empty)
    const muchos = Array.from({ length: TIER_LIMITS.maxTiers + 1 }, (_, i) => ({
      minTickets: i + 1,
      rate: (i + 1) * 1000,
    }))
    expect(tierProblems(muchos).list).toBe(TIER_MESSAGES.tooMany)
    // Veinte si caben.
    expect(hasTierProblems(tierProblems(muchos.slice(0, TIER_LIMITS.maxTiers)))).toBe(false)
  })

  it('cada fila dice SU problema, uno a la vez', () => {
    const cases: Array<[EditableTier[], number, string]> = [
      [[{ minTickets: 1, rate: null }], 0, TIER_MESSAGES.missing],
      [[{ minTickets: 2, rate: 30_000 }], 0, TIER_MESSAGES.firstNotOne],
      [[...LISTA.slice(0, 1), { minTickets: 0, rate: 40_000 }], 1, TIER_MESSAGES.minBelowOne],
      [[...LISTA.slice(0, 1), { minTickets: 100_001, rate: 40_000 }], 1, TIER_MESSAGES.minTooHigh],
      [[{ minTickets: 1, rate: 0 }], 0, TIER_MESSAGES.rateNotPositive],
      [[{ minTickets: 1, rate: 10_000_001 }], 0, TIER_MESSAGES.rateTooHigh],
    ]
    for (const [tiers, index, message] of cases) {
      expect(tierProblems(tiers).rows[index], message).toBe(message)
    }
  })

  it('dos tramos que empiezan igual: con singular y plural', () => {
    const repetido = tierProblems([LISTA[0]!, { minTickets: 1, rate: 40_000 }])
    expect(repetido.rows[1]).toBe(
      'Dos tramos empiezan desde 1 boleta. Cada tramo tiene que empezar en una cantidad distinta de boletas.',
    )
    expect(TIER_MESSAGES.duplicate(21)).toBe(
      'Dos tramos empiezan desde 21 boletas. Cada tramo tiene que empezar en una cantidad distinta de boletas.',
    )
  })

  it('cada tramo paga mas que el anterior, y lo dice con la cifra', () => {
    const plano = tierProblems([LISTA[0]!, { minTickets: 21, rate: 30_000 }])
    expect(plano.rows[1]).toBe(
      `El tramo que empieza en 21 boletas tiene que pagar más que el anterior, que paga ${formatCOP(30_000)} por boleta.`,
    )
  })

  it('en pantalla se escriben en orden: el editor deriva el «hasta» del siguiente', () => {
    const desordenado = tierProblems([LISTA[0]!, LISTA[2]!, LISTA[1]!])
    expect(desordenado.rows[2]).toBe(TIER_MESSAGES.outOfOrder(51))
  })

  it('un tramo incompleto no arrastra un error de orden a su vecino', () => {
    const problems = tierProblems([LISTA[0]!, { minTickets: null, rate: null }, LISTA[1]!])
    expect(problems.rows[1]).toBe(TIER_MESSAGES.missing)
    expect(problems.rows[2]).toBeUndefined()
  })
})

describe('el «hasta» se deriva y el ultimo queda abierto', () => {
  it('tierRanges: del siguiente menos uno, y el ultimo sin tope', () => {
    expect(tierRanges(LISTA)).toEqual([
      { from: 1, to: 20, rate: 30_000 },
      { from: 21, to: 50, rate: 40_000 },
      { from: 51, to: null, rate: 50_000 },
    ])
  })

  it('rowRangeText: lo que se sabe mientras se escribe', () => {
    expect(rowRangeText(LISTA, 0)).toBe('De 1 a 20 boletas')
    expect(rowRangeText(LISTA, 2)).toBe('51 boletas o más')
    expect(rowRangeText([{ minTickets: 1, rate: null }], 0)).toBe('1 boleta o más')
    expect(rowRangeText([{ minTickets: 1, rate: 1 }, { minTickets: 2, rate: 2 }], 0)).toBe('1 boleta')
    // El siguiente todavia sin escribir, o antes que este: no se inventa un tope.
    expect(rowRangeText([LISTA[0]!, { minTickets: null, rate: null }], 0)).toBe('Desde 1 boleta')
    expect(rowRangeText([LISTA[0]!, { minTickets: null, rate: null }], 1)).toBe('')
  })
})

describe('forma de la base', () => {
  it('toDbTiers y fromDbTiers van y vuelven, y fromDbTiers ordena', () => {
    const db = toDbTiers(LISTA)
    expect(db).toEqual([
      { min_tickets: 1, rate: 30_000 },
      { min_tickets: 21, rate: 40_000 },
      { min_tickets: 51, rate: 50_000 },
    ])
    expect(fromDbTiers([...db].reverse())).toEqual(LISTA)
    // PostgREST devuelve los `bigint` como texto a veces: se convierten.
    expect(fromDbTiers([{ min_tickets: 1, rate: '30000' }])).toEqual([{ minTickets: 1, rate: 30_000 }])
  })

  it('sameTiers compara el contenido, no la identidad', () => {
    expect(sameTiers(LISTA, LISTA.map((tier) => ({ ...tier })))).toBe(true)
    expect(sameTiers(LISTA, LISTA.slice(0, 2))).toBe(false)
    expect(sameTiers(LISTA, [LISTA[0]!, { minTickets: 21, rate: 41_000 }, LISTA[2]!])).toBe(false)
  })

  it('tierListSchema: enteros, completos y con los mensajes de la base', () => {
    expect(tierListSchema.safeParse(LISTA).success).toBe(true)
    const decimal = tierListSchema.safeParse([{ minTickets: 1, rate: 30_000.5 }])
    expect(decimal.success).toBe(false)
    expect(decimal.error?.issues[0]?.message).toBe(TIER_MESSAGES.notInteger)
    const vacia = tierListSchema.safeParse([])
    expect(vacia.error?.issues[0]?.message).toBe(TIER_MESSAGES.empty)
  })
})

describe('los mensajes son los de la migracion 0078, letra por letra', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/0078_seller_earning_agreements.sql'),
    'utf8',
  )

  it('las frases fijas', () => {
    const fijas = [
      TIER_MESSAGES.empty,
      TIER_MESSAGES.tooMany,
      TIER_MESSAGES.missing,
      TIER_MESSAGES.notInteger,
      TIER_MESSAGES.minBelowOne,
      TIER_MESSAGES.minTooHigh,
      TIER_MESSAGES.rateNotPositive,
      TIER_MESSAGES.rateTooHigh,
      TIER_MESSAGES.firstNotOne,
    ]
    for (const frase of fijas) expect(sql, frase).toContain(`'${frase}'`)
  })

  it('las que llevan cifras, con sus huecos donde la base pone %s', () => {
    const duplicada = TIER_MESSAGES.duplicate(21).replace('21 boletas', '%s %s')
    expect(sql).toContain(`'${duplicada}'`)
    const creciente = TIER_MESSAGES.notIncreasing(21, 30_000)
      .replace('21', '%s')
      .replace(formatCOP(30_000), '%s')
    expect(sql).toContain(`'${creciente}'`)
  })

  it('los mismos limites de cordura', () => {
    expect(sql).toContain(`> ${TIER_LIMITS.maxTiers} then`)
    expect(sql).toContain(`v_min > ${TIER_LIMITS.maxMinTickets} then`)
    expect(sql).toContain(`v_rate > ${TIER_LIMITS.maxRate} then`)
  })

  it('el alta del personal pide lo mismo que responde la RPC', () => {
    expect(sql).toContain(`'Elige cómo se le va a pagar: una ganancia fija o por tramos.'`)
    expect(sql).toContain(`'Escribe cuánto ganará por cada boleta que cobre completa.'`)
  })
})

describe('como se lee un acuerdo', () => {
  const tramos: Agreement = {
    mode: 'tiered',
    fixedAmount: null,
    list: { id: 'l1', kind: 'template', templateVersion: 1, tiers: LISTA },
  }

  it('firstTicketRate: la mitad redondea como el motor, el fijo es su cifra y los tramos, el primero', () => {
    expect(firstTicketRate({ mode: 'half_price', fixedAmount: null, list: null }, 120_001)).toBe(60_000)
    expect(firstTicketRate({ mode: 'half_price', fixedAmount: null, list: null }, null)).toBeNull()
    expect(firstTicketRate({ mode: 'fixed_per_ticket', fixedAmount: 25_000, list: null }, 120_000)).toBe(
      25_000,
    )
    expect(firstTicketRate(tramos, 120_000)).toBe(30_000)
    expect(firstTicketRate({ ...tramos, list: null }, 120_000)).toBeNull()
  })

  it('tierListOrigin: la general vigente, una anterior o unos propios', () => {
    expect(tierListOrigin(tramos.list!, 'l1')).toBe('current_template')
    expect(tierListOrigin(tramos.list!, 'l2')).toBe('old_template')
    expect(tierListOrigin({ ...tramos.list!, kind: 'custom', templateVersion: null }, 'l1')).toBe(
      'custom',
    )
  })
})

describe('los textos', () => {
  it('singular y plural: nunca «1 boletas»', () => {
    expect(paidTicketsPhrase(1)).toBe('1 boleta cobrada')
    expect(paidTicketsPhrase(25)).toBe('25 boletas cobradas')
    expect(EARNINGS_COPY.seller.nextTier(1, 40_000)).toBe(`Te falta 1 boleta para ${formatCOP(40_000)} por boleta`)
    expect(EARNINGS_COPY.seller.nextTierWithTeam(3, 40_000)).toBe(
      `Te faltan 3 boletas, tuyas o de tu equipo, para ${formatCOP(40_000)} por boleta`,
    )
    expect(EARNINGS_COPY.settings.earningsStatus(1, 1)).toBe('Lista general: 1 tramo · versión 1')
  })

  it('joinList: «A, B y C»', () => {
    expect(joinList(['A'])).toBe('A')
    expect(joinList(['A', 'B'])).toBe('A y B')
    expect(joinList(['A', 'B', 'C'])).toBe('A, B y C')
  })

  it('el tope del integrante se dice como lo dice la base (BR-G28)', () => {
    expect(EARNINGS_COPY.field.teamCap(30_000, true)).toBe(
      `Puedes darle hasta ${formatCOP(30_000)}, que es lo que ganas tú por boleta en tu primer tramo.`,
    )
    expect(EARNINGS_COPY.field.teamCap(60_000, false)).toBe(
      `Puedes darle hasta ${formatCOP(60_000)}, que es lo que ganas tú por boleta.`,
    )
  })

  it('el aviso del cambio nombra las rifas y, con equipo, lo del equipo', () => {
    const rifas = [
      EARNINGS_COPY.change.raffleWithCount('Rifa Navidad', 12),
      EARNINGS_COPY.change.raffleWithCount('Rifa Verano', 1),
    ]
    expect(EARNINGS_COPY.change.recalculates('Ana', rifas, true)).toBe(
      'Al guardar, volvemos a calcular lo que Ana lleva ganado en «Rifa Navidad» (12 boletas cobradas) y «Rifa Verano» (1 boleta cobrada), y lo que gana por las ventas de su equipo. Puede subir o bajar.',
    )
    expect(EARNINGS_COPY.change.saved('Ana', 1)).toBe(
      'La ganancia de Ana quedó guardada. Recalculamos lo que lleva ganado en 1 rifa.',
    )
  })

  it('ningun texto usa un termino que el glosario prohibe (Anexo A)', () => {
    const textos: string[] = []
    const recorrer = (valor: unknown) => {
      if (typeof valor === 'string') textos.push(valor)
      else if (typeof valor === 'function') {
        // Cada funcion con dos juegos de argumentos de muestra —cifras, o un
        // nombre con una lista— y las dos banderas. La que no encaja con un
        // juego se salta: el otro la cubre.
        const muestras: unknown[][] = [
          [3, 30_000, true],
          [1, 30_000, false],
          ['Ana', ['«Rifa Navidad» (3 boletas cobradas)'], true],
        ]
        for (const args of muestras) {
          try {
            const salida = (valor as (...args: unknown[]) => unknown)(...args)
            if (typeof salida === 'string') textos.push(salida)
          } catch {
            // Otra forma de argumentos.
          }
        }
      } else if (valor && typeof valor === 'object') Object.values(valor).forEach(recorrer)
    }
    recorrer(EARNINGS_COPY)
    recorrer(TIER_MESSAGES)

    for (const texto of textos) {
      expect(texto, texto).not.toMatch(/comisi[oó]n|\bnivel|\bticket|descuento|\bOwner\b|\bAdmin\b/i)
    }
  })
})

describe('los esquemas de las altas y los cambios', () => {
  const persona = {
    fullName: 'Ana Torres',
    alias: '',
    phone: '3001234567',
    email: 'ana@demo.test',
  }

  it('el alta del personal: un vendedor nace con su acuerdo, nunca sin el', () => {
    const sin = createUserSchema.safeParse({ ...persona, role: 'seller' })
    expect(sin.error?.issues[0]?.message).toBe(
      'Elige cómo se le va a pagar: una ganancia fija o por tramos.',
    )
    const fijoSinCifra = createUserSchema.safeParse({
      ...persona,
      role: 'seller',
      commissionModel: 'fixed_per_ticket',
    })
    expect(fijoSinCifra.error?.issues[0]?.message).toBe(
      'Escribe cuánto ganará por cada boleta que cobre completa.',
    )
    expect(
      createUserSchema.safeParse({ ...persona, role: 'seller', commissionModel: 'tiered' }).success,
    ).toBe(true)
    expect(
      createUserSchema.safeParse({
        ...persona,
        role: 'seller',
        commissionModel: 'tiered',
        customTiers: LISTA,
      }).success,
    ).toBe(true)
    // Un administrador no vende: no se le pide nada de esto.
    expect(createUserSchema.safeParse({ ...persona, role: 'admin' }).success).toBe(true)
  })

  it('la mitad del precio no es una opcion de ningun formulario (BR-G30)', () => {
    expect(
      createUserSchema.safeParse({ ...persona, role: 'seller', commissionModel: 'half_price' })
        .success,
    ).toBe(false)
    expect(
      setSellerAgreementSchema.safeParse({ sellerId: SELLER, commissionModel: 'half_price' }).success,
    ).toBe(false)
  })

  it('la cifra fija tiene el mismo tope que la base', () => {
    const alta = createUserSchema.safeParse({
      ...persona,
      role: 'seller',
      commissionModel: 'fixed_per_ticket',
      fixedCommissionAmount: 10_000_001,
    })
    expect(alta.error?.issues[0]?.message).toBe(TIER_MESSAGES.rateTooHigh)
  })

  it('el formulario acepta tramos a medias mientras se escriben, pero no los deja enviar', () => {
    const aMedias = userDialogSchema.safeParse({
      ...persona,
      commissionModel: 'tiered',
      customTiers: [{ minTickets: 1, rate: null }],
    })
    expect(aMedias.success).toBe(false)
    expect(aMedias.error?.issues[0]?.path).toEqual(['customTiers'])
    expect(aMedias.error?.issues[0]?.message).toBe(TIER_MESSAGES.missing)
    // Con el fijo elegido, los tramos no cuentan.
    expect(
      userDialogSchema.safeParse({
        ...persona,
        commissionModel: 'fixed_per_ticket',
        fixedCommissionAmount: 20_000,
        customTiers: [{ minTickets: 1, rate: null }],
      }).success,
    ).toBe(true)
  })

  it('el cambio del personal: sin tarjeta elegida no se envia', () => {
    const nada = sellerAgreementFormSchema.safeParse({ sellerId: SELLER, commissionModel: null })
    expect(nada.error?.issues[0]?.message).toBe('Elige cómo se le va a pagar.')
    expect(
      sellerAgreementFormSchema.safeParse({
        sellerId: SELLER,
        commissionModel: 'tiered',
        customTiers: null,
      }).success,
    ).toBe(true)
  })

  it('el alta del equipo no admite tramos propios: el padre no escribe listas (BR-G24)', () => {
    const parsed = createTeamMemberSchema.parse({
      ...persona,
      commissionModel: 'tiered',
      customTiers: LISTA,
    })
    expect('customTiers' in parsed).toBe(false)
  })

  it('guardar la lista general exige la lista entera y bien escrita', () => {
    expect(saveCommissionTemplateSchema.safeParse({ tiers: LISTA }).success).toBe(true)
    expect(saveCommissionTemplateSchema.safeParse({ tiers: [] }).success).toBe(false)
  })
})
