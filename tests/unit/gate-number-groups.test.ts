/**
 * LOS EFECTOS DE DATOS DE LA 0084 EN LA PUERTA, sin base (D-261, D-262, I-191).
 *
 * La `0084` es la única de la publicación `0081,0082,0083,0084` que deja datos: crea
 * `raffle_number_format_audits` CON una fila por rifa que ya existía, y les asigna a esas
 * rifas «Diario» 4 + «Semanal» 4 con columnas nuevas. La regla de siempre de
 * `gate-compare` —una tabla nueva nace vacía— la detendría aunque todo estuviera bien.
 *
 * `numberGroupMigrationEffects` lo comprueba con los hechos de las dos fotos: lo esperado
 * se DERIVA de las boletas de la foto de antes, contadas con la misma definición que la
 * migración, y se compara con la auditoría, la configuración de las rifas y el
 * `number_group_count` de las boletas de la foto de después. Aquí se le dan hechos
 * escritos a mano: un caso correcto que pasa entero y, a partir de él, una desviación
 * cada vez, que tiene que detener diciendo cuál.
 */
import { describe, expect, it } from 'vitest'

import {
  DATA_MIGRATIONS,
  dataMigrationFor,
  numberGroupMigrationEffects,
  type DataEffectsInput,
  type NumberFacts,
} from '../../scripts/gate-data-effects'

const O1 = '11111111-0000-4000-8000-000000000001'
const O2 = '22222222-0000-4000-8000-000000000002'
const R1 = '99999999-0000-4000-8000-000000000001'
const R2 = '99999999-0000-4000-8000-000000000002'
const R3 = '99999999-0000-4000-8000-000000000003'

const SIN_CONFIG = {
  number_group_count: null,
  first_group_name: null,
  first_group_digits: null,
  second_group_name: null,
  second_group_digits: null,
}
const CUATRO_Y_CUATRO = {
  number_group_count: 2,
  first_group_name: 'Diario',
  first_group_digits: 4,
  second_group_name: 'Semanal',
  second_group_digits: 4,
}

/** R1 con 1.318 boletas, 3 fuera de formato; R2 con 3 boletas; R3 sin boletas. */
function antes(): NumberFacts {
  return {
    forma: 'antes',
    rifas: [
      { id: R1, organization_id: O1, ...SIN_CONFIG },
      { id: R2, organization_id: O1, ...SIN_CONFIG },
      { id: R3, organization_id: O2, ...SIN_CONFIG },
    ],
    boletas: [
      {
        raffle_id: R1,
        tickets_count: 1318,
        tickets_with_numbers: 1317,
        nonconforming_count: 3,
        nonconforming_by_status: { available: 2, assigned: 1 },
        daily_lengths: { '1': 1, '3': 1, '4': 1315 },
        weekly_lengths: { '2': 1, '4': 1316 },
        grupos: {},
      },
      {
        raffle_id: R2,
        tickets_count: 3,
        tickets_with_numbers: 3,
        nonconforming_count: 0,
        nonconforming_by_status: {},
        daily_lengths: { '4': 3 },
        weekly_lengths: { '4': 3 },
        grupos: {},
      },
    ],
    auditoria: null,
  }
}

function auditoriaDe(b: NumberFacts['boletas'][number] | undefined, r: NumberFacts['rifas'][number]) {
  return {
    raffle_id: r.id,
    organization_id: r.organization_id,
    source: '0084',
    ...CUATRO_Y_CUATRO,
    tickets_count: b?.tickets_count ?? 0,
    tickets_with_numbers: b?.tickets_with_numbers ?? 0,
    nonconforming_count: b?.nonconforming_count ?? 0,
    nonconforming_by_status: b?.nonconforming_by_status ?? {},
    daily_lengths: b?.daily_lengths ?? {},
    weekly_lengths: b?.weekly_lengths ?? {},
  }
}

function despues(): NumberFacts {
  const a = antes()
  return {
    forma: '0084',
    rifas: a.rifas.map((r) => ({ ...r, ...CUATRO_Y_CUATRO })),
    boletas: a.boletas.map((b) => ({ ...b, grupos: { '2': b.tickets_count } })),
    auditoria: a.rifas.map((r) =>
      auditoriaDe(
        a.boletas.find((b) => b.raffle_id === r.id),
        r,
      ),
    ),
  }
}

function entrada(parcial: Partial<DataEffectsInput> = {}): DataEffectsInput {
  return {
    before: antes(),
    after: despues(),
    cambios: {},
    tablasNuevas: { raffle_number_format_audits: 3, ticket_holds: 0 },
    filasAntes: { raffles: 3, tickets: 1321 },
    claveComisiones: ['raffle_id', 'seller_id'],
    bitacoraNueva: [],
    ...parcial,
  }
}

function conDespues(cambia: (d: NumberFacts) => void, parcial: Partial<DataEffectsInput> = {}) {
  const d = despues()
  cambia(d)
  return numberGroupMigrationEffects(entrada({ after: d, ...parcial }))
}

const motivos = (r: { detener: string[] }) => r.detener.join('\n')

describe('N1 — lo correcto pasa, y lo esperado se deriva de la foto de antes', () => {
  it('N1-01: tres rifas —con boletas fuera de formato, en formato y sin boletas— no detienen', () => {
    const r = numberGroupMigrationEffects(entrada())
    expect(r.detener).toEqual([])
    expect(r.explicadas).toEqual([])
    expect(r.bitacoraUsada).toEqual([])
    expect(r.resumen).toEqual({ rifas: 3, boletas: 1321, fuera_de_formato: 3 })
  })

  it('N1-02: con otro número de rifas y ninguna fuera de formato también pasa', () => {
    const b = antes()
    b.rifas = [b.rifas[1]!]
    b.boletas = [b.boletas[1]!]
    const d = despues()
    d.rifas = [d.rifas[1]!]
    d.boletas = [d.boletas[1]!]
    d.auditoria = [d.auditoria![1]!]
    const r = numberGroupMigrationEffects(
      entrada({ before: b, after: d, tablasNuevas: { raffle_number_format_audits: 1 } }),
    )
    expect(r.detener).toEqual([])
    expect(r.resumen).toEqual({ rifas: 1, boletas: 3, fuera_de_formato: 0 })
  })
})

describe('N2 — la auditoría: una fila por rifa de antes, con lo que encontró', () => {
  it('N2-01: falta la fila de una rifa, o sobra una de una rifa que no existía', () => {
    expect(motivos(conDespues((d) => d.auditoria!.pop()))).toMatch(
      new RegExp(`Rifa ${R3}: sin su fila en raffle_number_format_audits`),
    )
    const otra = '99999999-0000-4000-8000-000000000009'
    expect(
      motivos(
        conDespues((d) => d.auditoria!.push({ ...d.auditoria![0]!, raffle_id: otra }), {
          tablasNuevas: { raffle_number_format_audits: 4 },
        }),
      ),
    ).toMatch(new RegExp(`Auditoría de ${otra}: esa rifa no existía antes de la migración`))
  })

  it('N2-02: la tabla nueva no puede tener más ni menos filas que las que describen los hechos', () => {
    expect(
      motivos(
        numberGroupMigrationEffects(entrada({ tablasNuevas: { raffle_number_format_audits: 4 } })),
      ),
    ).toMatch(/raffle_number_format_audits tiene 4 filas y los hechos describen 3/)
    expect(
      motivos(numberGroupMigrationEffects(entrada({ tablasNuevas: { ticket_holds: 0 } }))),
    ).toMatch(/raffle_number_format_audits no es una tabla nueva de esta puerta/)
  })

  it('N2-03: la configuración asignada es Diario 4 + Semanal 4 y la fuente, la 0084', () => {
    expect(motivos(conDespues((d) => (d.auditoria![0]!.first_group_digits = 3)))).toMatch(
      new RegExp(`Auditoría de ${R1}: first_group_digits es 3 y se esperaba 4`),
    )
    expect(motivos(conDespues((d) => (d.auditoria![1]!.second_group_name = 'Seco')))).toMatch(
      /second_group_name es "Seco" y se esperaba "Semanal"/,
    )
    expect(motivos(conDespues((d) => (d.auditoria![2]!.source = 'manual')))).toMatch(
      /source es "manual" y se esperaba "0084"/,
    )
    expect(motivos(conDespues((d) => (d.auditoria![0]!.organization_id = O2)))).toMatch(
      new RegExp(`Auditoría de ${R1}: organization_id`),
    )
  })

  it('N2-04: cada recuento tiene que ser el de la foto de antes', () => {
    for (const [campo, valor, texto] of [
      ['tickets_count', 1317, /tickets_count es 1317 y se esperaba 1318/],
      ['tickets_with_numbers', 1318, /tickets_with_numbers es 1318 y se esperaba 1317/],
      ['nonconforming_count', 0, /nonconforming_count es 0 y se esperaba 3/],
      ['nonconforming_by_status', { available: 3 }, /nonconforming_by_status/],
      ['daily_lengths', { '4': 1317 }, /daily_lengths/],
      ['weekly_lengths', { '4': 1317 }, /weekly_lengths/],
    ] as const) {
      const r = conDespues((d) => {
        ;(d.auditoria![0] as Record<string, unknown>)[campo] = valor
      })
      expect(motivos(r), campo).toMatch(texto)
    }
    // Una rifa sin boletas: ceros y objetos vacíos, nada más.
    expect(motivos(conDespues((d) => (d.auditoria![2]!.tickets_count = 1)))).toMatch(
      new RegExp(`Auditoría de ${R3}: tickets_count es 1 y se esperaba 0`),
    )
  })
})

describe('N3 — las rifas y las boletas de después', () => {
  it('N3-01: toda rifa que existía queda en Diario 4 + Semanal 4', () => {
    expect(motivos(conDespues((d) => (d.rifas[1]!.number_group_count = 1)))).toMatch(
      new RegExp(`Rifa ${R2}: number_group_count es 1 y se esperaba 2`),
    )
    expect(motivos(conDespues((d) => (d.rifas[0]!.first_group_name = 'Mayor')))).toMatch(
      new RegExp(`Rifa ${R1}: first_group_name es "Mayor"`),
    )
    expect(motivos(conDespues((d) => d.rifas.pop()))).toMatch(
      new RegExp(`Rifa ${R3}: no está en la foto de después`),
    )
  })

  it('N3-02: toda boleta que existía queda con number_group_count = 2', () => {
    expect(
      motivos(conDespues((d) => (d.boletas[0]!.grupos = { '2': 1317, '1': 1 }))),
    ).toMatch(new RegExp(`Boletas de ${R1}: number_group_count {"1":1,"2":1317}`))
    expect(motivos(conDespues((d) => (d.boletas[1]!.grupos = {})))).toMatch(
      new RegExp(`Boletas de ${R2}: number_group_count {}`),
    )
  })
})

describe('N4 — sin hechos no hay comprobación, y solo esta lista los tiene', () => {
  it('N4-01: fotos sin los hechos de números, o con la forma que no toca, detienen sin adivinar', () => {
    expect(motivos(numberGroupMigrationEffects(entrada({ before: undefined })))).toMatch(
      /no traen los hechos de números/,
    )
    expect(motivos(numberGroupMigrationEffects(entrada({ after: {} })))).toMatch(
      /no traen los hechos de números/,
    )
    expect(motivos(numberGroupMigrationEffects(entrada({ before: despues() })))).toMatch(
      /foto de antes ya tiene la 0084/,
    )
    expect(motivos(numberGroupMigrationEffects(entrada({ after: antes() })))).toMatch(
      /foto de después no tiene la 0084/,
    )
  })

  it('N4-02: los efectos de datos son de la publicación exacta 0081,0082,0083,0084', () => {
    const entry = dataMigrationFor(['0081', '0082', '0083', '0084'])
    expect(entry).toBe(DATA_MIGRATIONS['0081,0082,0083,0084'])
    expect(entry!.hechos).toBe('numeros')
    expect([...entry!.tablasConDatos]).toEqual(['raffle_number_format_audits'])
    expect([...entry!.tablasRetiradas]).toEqual([])
    expect(DATA_MIGRATIONS['0078,0079']!.hechos).toBe('ganancias')
    for (const otras of [
      ['0084'],
      ['0083', '0084'],
      ['0081', '0082'],
      ['0081', '0082', '0083'],
      ['0080', '0081', '0082', '0083', '0084'],
      ['0084', '0083', '0082', '0081'],
    ]) {
      expect(dataMigrationFor(otras), otras.join(',')).toBeNull()
    }
  })
})
