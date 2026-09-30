/**
 * LOS EFECTOS DE DATOS DE LA 0078 Y LA 0079, sin base (I-191, D-240).
 *
 * `earningMigrationEffects` decide, con los hechos de la foto de antes y los de después,
 * si una migración que MIGRA DATOS dejó exactamente lo que sus reglas dicen. Aquí se le
 * dan hechos escritos a mano: un caso correcto —que tiene que pasar entero— y, a partir
 * de él, una desviación cada vez, que tiene que detener diciendo cuál.
 *
 * Ningún recuento del ensayo está en la herramienta: E1-02 la pasa con otro tamaño de
 * organización y con otros tramos, y E1-03 con una organización sin tramos.
 */
import { describe, expect, it } from 'vitest'

import {
  DATA_MIGRATIONS,
  dataMigrationFor,
  DEFAULT_TIERS,
  earningMigrationEffects,
  type AuditFact,
  type DataEffectsInput,
  type EarningFacts,
} from '../../scripts/gate-data-effects'
import type { TableChanges } from '../../scripts/gate-diff'

const O1 = '11111111-0000-4000-8000-000000000001'
const O2 = '22222222-0000-4000-8000-000000000002'
const JEFE = 'aaaaaaaa-0000-4000-8000-00000000000a'
const TRAMOS = 'bbbbbbbb-0000-4000-8000-00000000000b'
const FIJO = 'cccccccc-0000-4000-8000-00000000000c'
const DUENO = 'dddddddd-0000-4000-8000-00000000000d'
const SOLO = 'eeeeeeee-0000-4000-8000-00000000000e'
const R1 = '99999999-0000-4000-8000-000000000001'
const R2 = '99999999-0000-4000-8000-000000000002'
const L1 = '77777777-0000-4000-8000-000000000001'
const L2 = '77777777-0000-4000-8000-000000000002'
const M = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

const TRAMOS_O1 = [
  { min_tickets: 1, rate: '15000' },
  { min_tickets: 11, rate: '22000' },
  { min_tickets: 41, rate: '35000' },
]

function antes(): EarningFacts {
  return {
    forma: '0077',
    organizaciones: [O1, O2],
    tramos: TRAMOS_O1.map((t) => ({ organization_id: O1, ...t })),
    listas: null,
    membresias: [
      {
        id: M(1),
        organization_id: O1,
        profile_id: JEFE,
        role: 'seller',
        parent_seller_id: null,
        commission_model: 'tiered',
        fixed_commission_amount: null,
      },
      {
        id: M(2),
        organization_id: O1,
        profile_id: TRAMOS,
        role: 'seller',
        parent_seller_id: JEFE,
        commission_model: 'tiered',
        fixed_commission_amount: null,
      },
      {
        id: M(3),
        organization_id: O1,
        profile_id: FIJO,
        role: 'seller',
        parent_seller_id: JEFE,
        commission_model: 'fixed_per_ticket',
        fixed_commission_amount: '30000',
      },
      {
        id: M(4),
        organization_id: O1,
        profile_id: DUENO,
        role: 'owner',
        parent_seller_id: null,
        commission_model: 'tiered',
        fixed_commission_amount: null,
      },
      {
        id: M(5),
        organization_id: O2,
        profile_id: SOLO,
        role: 'seller',
        parent_seller_id: null,
        commission_model: 'tiered',
        fixed_commission_amount: null,
      },
    ],
    comisiones: [
      {
        organization_id: O1,
        raffle_id: R1,
        seller_id: JEFE,
        tickets_paid: 10,
        rate: '60000',
        earned: '600000',
        team_tickets_paid: 4,
        team_earned: '180000',
      },
      {
        organization_id: O1,
        raffle_id: R1,
        seller_id: TRAMOS,
        tickets_paid: 4,
        rate: '15000',
        earned: '60000',
        team_tickets_paid: 0,
        team_earned: '0',
      },
    ],
    ledger: [
      { raffle_id: R1, seller_id: JEFE, team_movement: false, n: 10, suma: '600000' },
      { raffle_id: R1, seller_id: JEFE, team_movement: true, n: 4, suma: '180000' },
      { raffle_id: R1, seller_id: TRAMOS, team_movement: false, n: 4, suma: '60000' },
    ],
    pagos: [
      { seller_id: JEFE, n: 12, vigente: '1200000', anulado: '0' },
      { seller_id: TRAMOS, n: 5, vigente: '480000', anulado: '120000' },
    ],
    boletas: [
      {
        raffle_id: R1,
        seller_id: JEFE,
        inventory_status: 'assigned',
        payment_status: 'paid',
        n: 10,
        precio: '1200000',
        abonado: '1200000',
      },
      {
        raffle_id: R1,
        seller_id: TRAMOS,
        inventory_status: 'assigned',
        payment_status: 'paid',
        n: 4,
        precio: '480000',
        abonado: '480000',
      },
      {
        raffle_id: R2,
        seller_id: FIJO,
        inventory_status: 'available',
        payment_status: 'unpaid',
        n: 20,
        precio: '0',
        abonado: '0',
      },
    ],
    // El equipo del jefe tiene boletas en R1 —ya tiene fila— y en R2 —no la tiene—.
    equipos_con_boletas: [
      { organization_id: O1, raffle_id: R1, parent_seller_id: JEFE },
      { organization_id: O1, raffle_id: R2, parent_seller_id: JEFE },
    ],
  }
}

/** Lo que las migraciones dejan, derivado a mano de `antes()` con sus reglas. */
function despues(): EarningFacts {
  const b = antes()
  return {
    ...b,
    forma: '0078',
    tramos: null,
    listas: [
      {
        id: L1,
        organization_id: O1,
        kind: 'template',
        template_version: 1,
        owner_profile_id: null,
        created_by: null,
        tramos: TRAMOS_O1.map((t) => ({ ...t })),
      },
      {
        id: L2,
        organization_id: O2,
        kind: 'template',
        template_version: 1,
        owner_profile_id: null,
        created_by: null,
        tramos: DEFAULT_TIERS.map((t) => ({ ...t })),
      },
    ],
    membresias: b.membresias.map((m) => ({
      ...m,
      direct_commission_mode: 'half_price',
      direct_fixed_amount: null,
      direct_tier_list_id: null,
      team_tier_list_id: m.id === M(2) ? L1 : null,
    })),
    comisiones: [
      { ...b.comisiones[0]!, tier_tickets_paid: 14, team_shortfall: '0' },
      { ...b.comisiones[1]!, tier_tickets_paid: 4, team_shortfall: '0' },
      {
        organization_id: O1,
        raffle_id: R2,
        seller_id: JEFE,
        tickets_paid: 0,
        rate: '0',
        earned: '0',
        team_tickets_paid: 0,
        team_earned: '0',
        tier_tickets_paid: 0,
        team_shortfall: '0',
      },
    ],
  }
}

const BITACORA: AuditFact = {
  id: '501',
  org: O1,
  action: 'membership.update',
  entity_type: 'membership',
  entity_id: M(2),
  actor: null,
  old_values: { team_tier_list_id: null },
  new_values: { team_tier_list_id: L1 },
}

function cambios(): Record<string, TableChanges> {
  return {
    memberships: {
      agregadas: [],
      quitadas: [],
      modificadas: [{ k: M(2), soloIgnoradas: true, soloLectura: false }],
    },
    seller_commissions: {
      agregadas: [`${R2}|${JEFE}`],
      quitadas: [],
      modificadas: [
        { k: `${R1}|${JEFE}`, soloIgnoradas: true, soloLectura: false },
        { k: `${R1}|${TRAMOS}`, soloIgnoradas: true, soloLectura: false },
      ],
    },
    audit_logs: { agregadas: ['501'], quitadas: [], modificadas: [] },
  }
}

function entrada(parcial: Partial<DataEffectsInput> = {}): DataEffectsInput {
  return {
    before: antes(),
    after: despues(),
    cambios: cambios(),
    tablasNuevas: { commission_tier_lists: 2, commission_tier_list_items: 7 },
    filasAntes: { commission_tiers: 3 },
    claveComisiones: ['raffle_id', 'seller_id'],
    bitacoraNueva: [BITACORA],
    ...parcial,
  }
}

/** El caso correcto con UN cambio en los hechos de después. */
function conDespues(cambia: (a: EarningFacts) => void, parcial: Partial<DataEffectsInput> = {}) {
  const a = despues()
  cambia(a)
  return earningMigrationEffects(entrada({ after: a, ...parcial }))
}

describe('E1 — la transformación correcta pasa, y nada está contado de antemano', () => {
  it('E1-01: el caso completo no detiene, y explica exactamente las filas que la migración escribe', () => {
    const r = earningMigrationEffects(entrada())
    expect(r.detener).toEqual([])
    expect(r.explicadas.map((e) => `${e.tabla}:${e.clave}`).sort()).toEqual(
      [
        `memberships:${M(2)}`,
        `seller_commissions:${R1}|${JEFE}`,
        `seller_commissions:${R1}|${TRAMOS}`,
        `seller_commissions:${R2}|${JEFE}`,
      ].sort(),
    )
    expect(r.bitacoraUsada).toEqual(['501'])
    expect(r.resumen).toMatchObject({
      organizaciones: 2,
      listas_version_1: 2,
      tramos_trasladados: 7,
      membresias: 5,
      integrantes_por_tramos_fijados: 1,
      comisiones_conservadas: 2,
      comisiones_nuevas_en_cero: 1,
    })
  })

  it('E1-02: con otro número de organizaciones y otros tramos también pasa: lo esperado se deriva', () => {
    const O3 = '33333333-0000-4000-8000-000000000003'
    const L3 = '77777777-0000-4000-8000-000000000003'
    const b = antes()
    b.organizaciones.push(O3)
    b.tramos!.push(
      { organization_id: O3, min_tickets: 1, rate: '9000' },
      { organization_id: O3, min_tickets: 5, rate: '9500' },
    )
    const a = despues()
    a.organizaciones.push(O3)
    a.listas!.push({
      id: L3,
      organization_id: O3,
      kind: 'template',
      template_version: 1,
      owner_profile_id: null,
      created_by: null,
      tramos: [
        { min_tickets: 1, rate: '9000' },
        { min_tickets: 5, rate: '9500' },
      ],
    })
    const r = earningMigrationEffects(
      entrada({
        before: b,
        after: a,
        tablasNuevas: { commission_tier_lists: 3, commission_tier_list_items: 9 },
        filasAntes: { commission_tiers: 5 },
      }),
    )
    expect(r.detener).toEqual([])
    expect(r.resumen).toMatchObject({ organizaciones: 3, tramos_trasladados: 9 })
  })

  it('E1-03: una organización sin tramos recibe los cuatro de la regla, y solo esos', () => {
    expect(conDespues((a) => (a.listas![1]!.tramos[0]!.rate = '20001')).detener[0]).toMatch(
      /tramos de la versión 1 de la organización 22222222… no son los que tenía/,
    )
  })

  it('E1-04: una fila de comisión que no se reescribió —sin boletas cobradas— no hace falta que figure como modificada', () => {
    const c = cambios()
    c.seller_commissions!.modificadas.pop()
    expect(earningMigrationEffects(entrada({ cambios: c })).detener).toEqual([])
  })
})

describe('E2 — los tramos: completos, de su organización, con sus importes y sus límites', () => {
  it('E2-01: una tarifa alterada detiene', () => {
    const r = conDespues((a) => (a.listas![0]!.tramos[1]!.rate = '22001'))
    expect(r.detener.join('\n')).toMatch(
      /organización 11111111… no son los que tenía.*desde 11 boleta/,
    )
  })

  it('E2-02: un límite movido, un tramo de menos o uno de más detienen', () => {
    expect(
      conDespues((a) => (a.listas![0]!.tramos[2]!.min_tickets = 40)).detener.join('\n'),
    ).toMatch(/no son los que tenía/)
    expect(
      conDespues((a) => a.listas![0]!.tramos.pop(), {
        tablasNuevas: { commission_tier_lists: 2, commission_tier_list_items: 6 },
      }).detener.join('\n'),
    ).toMatch(/2 tramo\(s\) frente a 3/)
    expect(
      conDespues((a) => a.listas![0]!.tramos.push({ min_tickets: 90, rate: '50000' }), {
        tablasNuevas: { commission_tier_lists: 2, commission_tier_list_items: 8 },
      }).detener.join('\n'),
    ).toMatch(/4 tramo\(s\) frente a 3/)
  })

  it('E2-03: los tramos de una organización en la lista de otra detienen en las dos', () => {
    const r = conDespues((a) => {
      const [x, y] = [a.listas![0]!.tramos, a.listas![1]!.tramos]
      a.listas![0]!.tramos = y
      a.listas![1]!.tramos = x
    })
    expect(r.detener.filter((d) => /no son los que tenía/.test(d))).toHaveLength(2)
  })

  it('E2-04: una lista que no es la versión 1 general, una personalizada o una de más detienen', () => {
    expect(conDespues((a) => (a.listas![0]!.template_version = 2)).detener.join('\n')).toMatch(
      /no es la versión 1/,
    )
    expect(conDespues((a) => (a.listas![0]!.created_by = DUENO)).detener.join('\n')).toMatch(
      /sin dueño y sin autor/,
    )
    const r = conDespues(
      (a) =>
        a.listas!.push({
          id: M(9),
          organization_id: O1,
          kind: 'custom',
          template_version: null,
          owner_profile_id: TRAMOS,
          created_by: null,
          tramos: [{ min_tickets: 1, rate: '1' }],
        }),
      { tablasNuevas: { commission_tier_lists: 3, commission_tier_list_items: 8 } },
    )
    expect(r.detener.join('\n')).toMatch(
      /tiene 2 lista\(s\) de tramos; la migración crea exactamente una/,
    )
  })

  it('E2-05: una organización sin su lista, o una lista de una organización que no existía, detienen', () => {
    expect(
      conDespues((a) => a.listas!.pop(), {
        tablasNuevas: { commission_tier_lists: 1, commission_tier_list_items: 3 },
      }).detener.join('\n'),
    ).toMatch(/22222222… tiene 0 lista/)
    expect(conDespues((a) => (a.listas![1]!.organization_id = M(8))).detener.join('\n')).toMatch(
      /organización que no existía/,
    )
  })

  it('E2-06: los hechos tienen que cuadrar con las filas de la foto', () => {
    expect(
      earningMigrationEffects(
        entrada({ tablasNuevas: { commission_tier_lists: 2, commission_tier_list_items: 9 } }),
      ).detener.join('\n'),
    ).toMatch(/commission_tier_list_items tiene 9 fila\(s\) y los hechos dicen 7/)
    expect(
      earningMigrationEffects(entrada({ filasAntes: { commission_tiers: 4 } })).detener.join('\n'),
    ).toMatch(/commission_tiers tenía 4 fila\(s\) y los hechos de antes dicen 3/)
  })
})

describe('E3 — las membresías: solo los cambios justificados, y con su bitácora', () => {
  it('E3-01: la lista de un integrante apuntando a OTRA organización detiene', () => {
    const r = conDespues((a) => (a.membresias[1]!.team_tier_list_id = L2))
    expect(r.detener.join('\n')).toMatch(/su lista de tramos es de OTRA organización \(22222222…\)/)
  })

  it('E3-02: un integrante por tramos sin su lista, o una lista en quien no lo es, detienen', () => {
    expect(
      conDespues((a) => (a.membresias[1]!.team_tier_list_id = null)).detener.join('\n'),
    ).toMatch(/no quedó en la versión 1/)
    expect(conDespues((a) => (a.membresias[2]!.team_tier_list_id = L1)).detener.join('\n')).toMatch(
      /no es un integrante por tramos/,
    )
    expect(conDespues((a) => (a.membresias[0]!.team_tier_list_id = L1)).detener.join('\n')).toMatch(
      /no es un integrante por tramos/,
    )
  })

  it('E3-03: una modificación adicional no prevista detiene, aunque solo toque updated_at', () => {
    const c = cambios()
    c.memberships!.modificadas.push({ k: M(5), soloIgnoradas: true, soloLectura: false })
    expect(earningMigrationEffects(entrada({ cambios: c })).detener.join('\n')).toMatch(
      /Membresía 00000000… modificada: la migración solo escribe las de integrantes por tramos/,
    )
  })

  it('E3-04: en la membresía que sí se escribe, de sus columnas de antes solo puede cambiar updated_at', () => {
    const c = cambios()
    c.memberships!.modificadas[0]!.soloIgnoradas = false
    expect(earningMigrationEffects(entrada({ cambios: c })).detener.join('\n')).toMatch(
      /cambió algo más que updated_at/,
    )
  })

  it('E3-05: una columna de antes cambiada, o un acuerdo administrativo que no sea la mitad, detienen', () => {
    expect(
      conDespues((a) => (a.membresias[2]!.fixed_commission_amount = '31000')).detener.join('\n'),
    ).toMatch(/cambió fixed_commission_amount/)
    expect(
      conDespues((a) => (a.membresias[1]!.parent_seller_id = null)).detener.join('\n'),
    ).toMatch(/cambió parent_seller_id/)
    expect(
      conDespues(
        (a) => (a.membresias[4]!.direct_commission_mode = 'fixed_per_ticket'),
      ).detener.join('\n'),
    ).toMatch(/acuerdo administrativo no es la mitad/)
    expect(
      conDespues((a) => (a.membresias[4]!.direct_tier_list_id = L2)).detener.join('\n'),
    ).toMatch(/acuerdo administrativo no es la mitad/)
  })

  it('E3-06: una membresía nueva o desaparecida detiene', () => {
    expect(conDespues((a) => a.membresias.pop()).detener.join('\n')).toMatch(/desapareció/)
    expect(
      conDespues((a) => a.membresias.push({ ...a.membresias[4]!, id: M(7) })).detener.join('\n'),
    ).toMatch(/Membresía nueva/)
  })

  it('E3-07: la bitácora: exactamente una fila, sin actor, que solo nombra team_tier_list_id', () => {
    const con = (b: AuditFact[]) =>
      earningMigrationEffects(entrada({ bitacoraNueva: b })).detener.join('\n')
    const esperado = /se esperaba UNA fila de bitácora membership\.update/
    expect(con([])).toMatch(esperado)
    expect(con([BITACORA, { ...BITACORA, id: '502' }])).toMatch(esperado)
    expect(con([{ ...BITACORA, actor: DUENO }])).toMatch(esperado)
    expect(con([{ ...BITACORA, org: O2 }])).toMatch(esperado)
    expect(con([{ ...BITACORA, new_values: { team_tier_list_id: L2 } }])).toMatch(esperado)
    expect(
      con([{ ...BITACORA, new_values: { team_tier_list_id: L1, commission_model: 'tiered' } }]),
    ).toMatch(esperado)
    expect(con([{ ...BITACORA, old_values: { team_tier_list_id: L2 } }])).toMatch(esperado)
    expect(con([{ ...BITACORA, action: 'membership.create' }])).toMatch(esperado)
  })

  it('E3-08: una fila de bitácora de otra cosa no se da por usada: la detiene la regla de siempre', () => {
    const otra: AuditFact = { ...BITACORA, id: '777', entity_id: M(5) }
    const r = earningMigrationEffects(entrada({ bitacoraNueva: [BITACORA, otra] }))
    expect(r.bitacoraUsada).toEqual(['501'])
  })
})

describe('E4 — el dinero, por entidad', () => {
  it('E4-01: una cifra de comisión cambiada detiene, diciendo cuál', () => {
    expect(conDespues((a) => (a.comisiones[0]!.earned = '600001')).detener.join('\n')).toMatch(
      /Comisión de aaaaaaaa… en la rifa 99999999…: cambió earned/,
    )
    expect(conDespues((a) => (a.comisiones[1]!.rate = '22000')).detener.join('\n')).toMatch(
      /cambió rate/,
    )
    expect(conDespues((a) => (a.comisiones[0]!.team_earned = '0')).detener.join('\n')).toMatch(
      /cambió team_earned/,
    )
    expect(conDespues((a) => (a.comisiones[0]!.tickets_paid = 11)).detener.join('\n')).toMatch(
      /cambió tickets_paid/,
    )
  })

  it('E4-02: dos diferencias que se compensan en el total se ven igual: se compara por entidad', () => {
    const r = conDespues((a) => {
      a.ledger[0]!.suma = '600100'
      a.ledger[2]!.suma = '59900'
    })
    expect(r.detener.join('\n')).toMatch(
      /movimientos del ledger no se conservan por entidad: 2 entidad\(es\)/,
    )
    const p = conDespues((a) => {
      a.pagos[0]!.vigente = '1200500'
      a.pagos[1]!.vigente = '479500'
    })
    expect(p.detener.join('\n')).toMatch(/Los pagos no se conservan por entidad: 2 entidad/)
  })

  it('E4-03: las boletas por vendedor y estado, y el recuento del ledger, tampoco cambian', () => {
    expect(conDespues((a) => (a.boletas[0]!.abonado = '1199999')).detener.join('\n')).toMatch(
      /Las boletas no se conservan por entidad/,
    )
    expect(conDespues((a) => (a.ledger[1]!.n = 5)).detener.join('\n')).toMatch(
      /ledger no se conservan por entidad: 1 entidad/,
    )
    expect(
      conDespues((a) =>
        a.ledger.push({ raffle_id: R2, seller_id: JEFE, team_movement: false, n: 1, suma: '0' }),
      ).detener.join('\n'),
    ).toMatch(/ledger no se conservan/)
  })

  it('E4-04: una sola fila tocada en el ledger, los pagos, sus asignaciones, las boletas o los clientes detiene', () => {
    for (const tabla of [
      'commission_ledger',
      'payments',
      'payment_allocations',
      'tickets',
      'clients',
    ]) {
      const c = cambios()
      c[tabla] = {
        agregadas: [],
        quitadas: [],
        modificadas: [{ k: 'x', soloIgnoradas: true, soloLectura: false }],
      }
      expect(earningMigrationEffects(entrada({ cambios: c })).detener.join('\n')).toMatch(
        new RegExp(`${tabla}: 0 nueva\\(s\\), 1 modificada\\(s\\) y 0 borrada\\(s\\)`),
      )
    }
  })

  it('E4-05: en una fila recontada, de sus columnas de antes solo puede cambiar updated_at', () => {
    const c = cambios()
    c.seller_commissions!.modificadas[0]!.soloIgnoradas = false
    expect(earningMigrationEffects(entrada({ cambios: c })).detener.join('\n')).toMatch(
      /cambió algo más que updated_at/,
    )
  })

  it('E4-06: las columnas nuevas: el tramo es propias más equipo, y el faltante, cero', () => {
    expect(conDespues((a) => (a.comisiones[0]!.tier_tickets_paid = 10)).detener.join('\n')).toMatch(
      /tier_tickets_paid no es propias más equipo/,
    )
    expect(
      conDespues((a) => (a.comisiones[0]!.team_shortfall = '5000')).detener.join('\n'),
    ).toMatch(/team_shortfall no es cero/)
  })

  it('E4-07: una fila nueva solo para un jefe cuyo equipo tiene boletas en esa rifa, y en cero', () => {
    expect(conDespues((a) => (a.comisiones[2]!.earned = '1')).detener.join('\n')).toMatch(
      /nueva de aaaaaaaa….*nace en cero/,
    )
    expect(conDespues((a) => (a.comisiones[2]!.seller_id = SOLO)).detener.join('\n')).toMatch(
      /no es un jefe cuyo equipo tenga boletas/,
    )
    expect(conDespues((a) => a.comisiones.pop()).detener.join('\n')).toMatch(
      /Falta la fila de comisión en cero del jefe/,
    )
    expect(conDespues((a) => a.comisiones.shift()).detener.join('\n')).toMatch(/desapareció/)
  })
})

describe('E5 — sin hechos no hay comprobación, y solo esta lista de migraciones los tiene', () => {
  it('E5-01: fotos sin los hechos de ganancias, o con la forma que no toca, detienen sin adivinar', () => {
    expect(earningMigrationEffects(entrada({ before: undefined })).detener[0]).toMatch(
      /no traen los hechos de ganancias/,
    )
    expect(earningMigrationEffects(entrada({ after: {} })).detener[0]).toMatch(
      /no traen los hechos de ganancias/,
    )
    expect(earningMigrationEffects(entrada({ before: despues() })).detener[0]).toMatch(
      /foto de antes no es de una base en 0077/,
    )
    expect(earningMigrationEffects(entrada({ after: antes() })).detener[0]).toMatch(
      /foto de después no tiene las listas/,
    )
  })

  it('E5-02: los efectos de datos son de la pareja exacta 0078,0079; cualquier otra lista no tiene', () => {
    expect(dataMigrationFor(['0078', '0079'])).toBe(DATA_MIGRATIONS['0078,0079'])
    expect([...DATA_MIGRATIONS['0078,0079']!.tablasConDatos].sort()).toEqual([
      'commission_tier_list_items',
      'commission_tier_lists',
    ])
    expect([...DATA_MIGRATIONS['0078,0079']!.tablasRetiradas]).toEqual(['commission_tiers'])
    for (const otras of [
      [],
      ['0078'],
      ['0079'],
      ['0079', '0078'],
      ['0077', '0078', '0079'],
      ['0078', '0079', '0080'],
      ['0075', '0076', '0077'],
    ]) {
      expect(dataMigrationFor(otras)).toBeNull()
    }
  })

  it('E5-03: las organizaciones tienen que ser las mismas', () => {
    expect(conDespues((a) => a.organizaciones.push(M(8))).detener.join('\n')).toMatch(
      /organizaciones no son las mismas/,
    )
  })
})
