/**
 * Las herramientas de puerta, sin base (Etapa 4 de D-208, `RUNBOOK` §9.0).
 *
 * `gate-db.ts` decide a qué base se conecta una foto o una sonda y exige que sea el
 * proyecto esperado; `gate-diff.ts` decide si dos fotos sirven para una puerta (T6,
 * I-145) y qué cambió entre ellas. Todo se prueba aquí sin red: `dotenv` está simulado
 * y ninguna prueba lee `.env.local`. La clasificación con evidencia de la base —la
 * «Opción A»— se ensaya contra la base local en `tests/db/record-prize-awards-script.test.ts`
 * (S8), y la procedencia con las herramientas de verdad en `tests/db/gate-provenance.test.ts`.
 */
import { createHash } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }))

import {
  connectionStringFor,
  GateArgsError,
  gateTarget,
  gateTargetLabel,
  LOCAL_DB_URL,
  parseArgs,
  projectRefFromDbUrl,
  type Snapshot,
} from '../../scripts/gate-db'
import {
  aclEntries,
  aclStatements,
  compareDeltas,
  cronHours,
  normalizeAcl,
  provenanceProblems,
  rowChanges,
  SNAPSHOT_FORMAT,
  snapshotDigest,
  snapshotProblems,
  structureDelta,
} from '../../scripts/gate-diff'
import { stableJson } from '../../scripts/record-prize-awards-guard'

const REF = 'proyectoficticioabcd'
const POOLER = `postgresql://postgres.${REF}:secreto-ficticio@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`

const spec = { switches: ['--structure-only'], valued: ['--organization'], positional: 1 }

describe('T1 — la orden de una herramienta de puerta', () => {
  it('T1-01: opciones desconocidas, repetidas o sin valor detienen la orden', () => {
    expect(() => parseArgs(['--locl'], spec)).toThrow(/No reconozco «--locl»/)
    expect(() => parseArgs(['--local', '--local'], spec)).toThrow(/repetido/)
    expect(() => parseArgs(['--organization'], spec)).toThrow(/Falta el valor/)
    expect(() => parseArgs(['uno', 'dos'], spec)).toThrow(/No reconozco «dos»/)
    expect(parseArgs(['foto', '--local'], spec).positional).toEqual(['foto'])
  })

  it('T1-02: un solo destino, y producción nombra el proyecto que espera', () => {
    expect(() => gateTarget(parseArgs([], spec))).toThrow(/un solo destino/)
    expect(() => gateTarget(parseArgs(['--local', '--production'], spec))).toThrow(
      /un solo destino/,
    )
    expect(() => gateTarget(parseArgs(['--production'], spec))).toThrow(/--project-ref/)
    expect(() => gateTarget(parseArgs(['--production', '--project-ref', 'CORTA'], spec))).toThrow(
      /20 letras minúsculas/,
    )
    expect(() => gateTarget(parseArgs(['--local', '--project-ref', REF], spec))).toThrow(
      /solo se usa con --production/,
    )
    expect(gateTarget(parseArgs(['--production', '--project-ref', REF], spec))).toEqual({
      kind: 'production',
      projectRef: REF,
    })
    expect(gateTarget(parseArgs(['--local'], spec))).toEqual({ kind: 'local', projectRef: null })
  })

  it('T1-03: el nombre del destino no escribe la referencia entera', () => {
    const etiqueta = gateTargetLabel({ kind: 'production', projectRef: REF })
    expect(etiqueta).toBe('PRODUCCIÓN (proyecto proy…)')
    expect(etiqueta).not.toContain(REF)
  })
})

describe('T2 — la cadena de conexión tiene que ser la del proyecto esperado', () => {
  const guardada = process.env.SUPABASE_DB_URL
  afterEach(() => {
    if (guardada === undefined) delete process.env.SUPABASE_DB_URL
    else process.env.SUPABASE_DB_URL = guardada
  })

  it('T2-01: la referencia sale del usuario del pooler o del host directo, nunca de una base local', () => {
    expect(projectRefFromDbUrl(POOLER)).toBe(REF)
    expect(projectRefFromDbUrl(`postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres`)).toBe(
      REF,
    )
    expect(projectRefFromDbUrl(LOCAL_DB_URL)).toBeNull()
    expect(projectRefFromDbUrl(`postgresql://postgres.${REF}:x@127.0.0.1:5432/postgres`)).toBeNull()
    expect(projectRefFromDbUrl('no-es-una-url')).toBeNull()
  })

  it('T2-02: local no lee nada; producción exige que la cadena nombre el proyecto pedido', () => {
    expect(connectionStringFor({ kind: 'local', projectRef: null })).toBe(LOCAL_DB_URL)

    process.env.SUPABASE_DB_URL = POOLER
    expect(connectionStringFor({ kind: 'production', projectRef: REF })).toBe(POOLER)
    expect(() =>
      connectionStringFor({ kind: 'production', projectRef: 'otroproyectoficticio' }),
    ).toThrow(/no es el proyecto esperado/)
    process.env.SUPABASE_DB_URL = LOCAL_DB_URL
    expect(() => connectionStringFor({ kind: 'production', projectRef: REF })).toThrow(
      /no nombra ningún proyecto remoto/,
    )
    delete process.env.SUPABASE_DB_URL
    expect(() => connectionStringFor({ kind: 'production', projectRef: REF })).toThrow(
      GateArgsError,
    )
  })

  it('T2-03: ningún mensaje de la puerta escribe la cadena ni su contraseña', () => {
    process.env.SUPABASE_DB_URL = POOLER
    try {
      connectionStringFor({ kind: 'production', projectRef: 'otroproyectoficticio' })
    } catch (error) {
      expect(String(error)).not.toContain('secreto-ficticio')
      expect(String(error)).not.toContain(REF)
    }
  })
})

const CAPTURA_A = '0a0a0a0a-0000-4000-8000-00000000000a'
const CAPTURA_B = '0b0b0b0b-0000-4000-8000-00000000000b'

/**
 * Una foto mínima y válida del formato actual, con la estructura y las filas que diga
 * cada prueba, y su huella calculada al final.
 */
function foto(parcial: Partial<Snapshot> = {}): Snapshot {
  const s: Snapshot = {
    formato: SNAPSHOT_FORMAT,
    captura: CAPTURA_A,
    etiqueta: 'prueba',
    entorno: 'local',
    proyecto: null,
    base: null,
    meta: {
      ahora: '2026-09-18T20:00:00.000Z',
      reloj: '2026-09-18T20:00:00.000Z',
      snapshot: '1:1:',
      version: '17',
      usuario: 'postgres',
      replica: false,
    },
    migraciones: [{ version: '0066', name: 'prize_function_privileges' }],
    estructura: {
      tablas: [
        {
          nombre: 'tickets',
          tipo: 'r',
          rls: true,
          rls_forzada: true,
          acl: '{postgres=arwdDxtm/postgres}',
        },
      ],
      columnas: [
        { tabla: 'tickets', columna: 'id', tipo: 'uuid', no_nulo: true, defecto: null, acl: null },
      ],
      restricciones: [],
      indices: [],
      disparadores: [],
      politicas: [],
      funciones: [],
      tipos: [],
      vistas: [],
      extensiones: [],
      cron: [],
      vault: [],
      publicaciones: [],
      privilegios_por_defecto: [],
      esquema_public: [],
    },
    filas: {
      tickets: {
        pk: ['id'],
        columnas_nuevas: [],
        n: 2,
        filas: { a: ['h1', 'c1', null], b: ['h2', 'c2', null] },
      },
    },
    hechos: {},
    ...parcial,
  }
  return { ...s, huella: snapshotDigest(s) }
}

/** La foto de después: otra captura, un minuto más tarde y del mismo destino, salvo que se diga otra cosa. */
function despuesDe(antes: Snapshot, parcial: Partial<Snapshot> = {}): Snapshot {
  return foto({
    entorno: antes.entorno,
    proyecto: antes.proyecto,
    captura: CAPTURA_B,
    etiqueta: 'prueba-despues',
    meta: { ...antes.meta, ahora: '2026-09-18T20:01:00.000Z', reloj: '2026-09-18T20:01:00.000Z' },
    ...parcial,
  })
}

describe('T3 — qué cambió en la estructura', () => {
  it('T3-01: un ACL se compara sin quién lo concedió y sin orden', () => {
    expect(normalizeAcl('{service_role=X/postgres,postgres=X/postgres}')).toBe(
      'postgres=X,service_role=X',
    )
    expect(normalizeAcl('{postgres=X/supabase_admin,service_role=X/supabase_admin}')).toBe(
      normalizeAcl('{service_role=X/postgres,postgres=X/postgres}'),
    )
    expect(normalizeAcl(null)).toBeNull()
  })

  it('T3-02: lo añadido, lo quitado y lo cambiado, por categoría', () => {
    const antes = foto()
    const despues = foto({
      migraciones: [...antes.migraciones, { version: '0067', name: 'prize_award_history' }],
      estructura: {
        ...antes.estructura,
        tablas: [
          {
            nombre: 'tickets',
            tipo: 'r',
            rls: true,
            rls_forzada: true,
            acl: '{postgres=arwdDxtm/postgres,authenticated=r/postgres}',
          },
          { nombre: 'declared_prize_awards', tipo: 'r', rls: true, rls_forzada: true, acl: null },
        ],
        funciones: [{ firma: 'prize_award_rows()', cuerpo: 'x', acl: '{postgres=X/postgres}' }],
      },
    })
    const delta = structureDelta(antes, despues)
    expect(Object.keys(delta.tablas!.agregados)).toEqual(['declared_prize_awards'])
    expect(Object.keys(delta.tablas!.cambiados)).toEqual(['tickets'])
    expect(Object.keys(delta.funciones!.agregados)).toEqual(['prize_award_rows()'])
    expect(Object.keys(delta.migraciones!.agregados)).toEqual(['0067'])
    expect(structureDelta(antes, foto())).toEqual({})
  })

  it('T3-03: el delta observado se contrasta con el ensayado, en las tres direcciones', () => {
    const antes = foto()
    const esperado = structureDelta(
      antes,
      foto({
        estructura: {
          ...antes.estructura,
          funciones: [{ firma: 'f()', cuerpo: 'x', acl: '{postgres=X/postgres}' }],
        },
      }),
    )
    expect(compareDeltas(esperado, esperado)).toEqual([])
    const conOtroPermiso = structureDelta(
      antes,
      foto({
        estructura: {
          ...antes.estructura,
          funciones: [
            { firma: 'f()', cuerpo: 'x', acl: '{postgres=X/postgres,service_role=X/postgres}' },
          ],
        },
      }),
    )
    expect(compareDeltas(esperado, conOtroPermiso)).toEqual([
      'funciones «f()»: se creó con otra definición',
    ])
    expect(compareDeltas(esperado, {})).toEqual([
      'funciones «f()»: se esperaba crearlo y no se creó',
    ])
    expect(compareDeltas({}, esperado)).toEqual(['funciones «f()»: se creó sin esperarlo'])
  })
})

describe('T4 — qué filas cambiaron', () => {
  it('T4-01: nuevas, modificadas —distinguiendo lo que la bitácora no registra— y borradas', () => {
    const antes = foto()
    const despues = foto({
      filas: {
        tickets: {
          pk: ['id'],
          columnas_nuevas: [],
          n: 2,
          filas: { a: ['h1-otra', 'c1', null], c: ['h3', 'c3', null] },
        },
      },
    })
    const r = rowChanges(antes, despues)
    expect(r.cambios.tickets).toEqual({
      agregadas: ['c'],
      quitadas: ['b'],
      modificadas: [{ k: 'a', soloIgnoradas: true, soloLectura: false }],
    })
    expect(r.problemas).toEqual(['1 fila(s) borradas en tickets'])
  })

  it('T4-02: una tabla nueva tiene que nacer vacía, y una que desaparece se dice', () => {
    const r = rowChanges(
      foto(),
      foto({
        filas: {
          ...foto().filas,
          declared_prize_awards: {
            pk: ['id'],
            columnas_nuevas: [],
            n: 1,
            filas: { x: ['h', 'h', null] },
          },
        },
      }),
    )
    expect(r.tablasNuevas).toEqual({ declared_prize_awards: 1 })
    expect(r.problemas).toEqual([
      'La tabla nueva declared_prize_awards tiene 1 filas y tenía que nacer vacía',
    ])
    expect(rowChanges(foto(), foto({ filas: {} })).problemas).toEqual([
      'La tabla tickets desapareció',
    ])
  })

  it('T4-03: con columnas nuevas, sin --base no es comparable', () => {
    const despues = foto({
      estructura: {
        ...foto().estructura,
        columnas: [
          { tabla: 'tickets', columna: 'id' },
          { tabla: 'tickets', columna: 'nueva' },
        ],
      },
    })
    expect(rowChanges(foto(), despues).problemas[0]).toMatch(/no es comparable/)
  })
})

describe('T5 — horas del sincronizador y ACL', () => {
  it('T5-01: las horas UTC de vercel.json, sin minutos (Hobby dispara en cualquiera de la hora)', () => {
    const vercel = JSON.stringify({
      crons: [
        { path: '/api/lottery/sync', schedule: '0 12 * * *' },
        { path: '/api/lottery/sync', schedule: '50 3 * * *' },
        { path: '/api/lottery/sync', schedule: '20 3 * * *' },
      ],
    })
    expect([...cronHours(vercel)].sort((a, b) => a - b)).toEqual([3, 12])
  })

  it('T5-02: un ACL se lee por rol, y las sentencias llevan el local al de producción sin tocar al dueño', () => {
    expect(aclEntries('{postgres=X/postgres,=X/postgres,service_role=X*/postgres}')).toEqual(
      new Map([
        ['postgres', 'X'],
        ['public', 'X'],
        ['service_role', 'X'],
      ]),
    )
    expect(
      aclStatements(
        'function public.f()',
        '{postgres=X/postgres,=X/postgres}',
        '{postgres=X/postgres,service_role=X/postgres}',
        'postgres',
      ),
    ).toEqual([
      'revoke execute on function public.f() from public',
      'grant execute on function public.f() to "service_role"',
    ])
    expect(
      aclStatements(
        'table public."t"',
        '{postgres=arwdDxtm/postgres}',
        '{postgres=arwdDxtm/postgres}',
        'postgres',
      ),
    ).toEqual([])
  })
})

describe('T6 — de dónde viene una foto, y si sirve para una puerta (I-145)', () => {
  const LOCAL = { kind: 'local', projectRef: null } as const
  const PROD = { kind: 'production', projectRef: REF } as const
  const INVENTADO = 'aaaaaaaaaaaaaaaaaaaa'
  const OTRO = 'otroproyectoficticio'
  const enProduccion = (proyecto: string, parcial: Partial<Snapshot> = {}) =>
    foto({ entorno: 'produccion', proyecto, ...parcial })

  it('T6-01: una foto completa no tiene problemas, y su huella es el SHA-256 de su representación estable', () => {
    const f = foto()
    expect(snapshotProblems(f, 'de antes')).toEqual([])
    const { huella, ...resto } = f
    expect(huella).toBe(createHash('sha256').update(stableJson(resto)).digest('hex'))
    // Cualquier cambio posterior la delata: una fila, el destino o la etiqueta.
    const otraFila = {
      ...f,
      filas: {
        tickets: { ...f.filas.tickets!, filas: { a: ['otra', 'c1', null], b: ['h2', 'c2', null] } },
      },
    }
    for (const tocada of [
      otraFila,
      { ...f, entorno: 'produccion' as const, proyecto: REF },
      { ...f, etiqueta: 'otra' },
    ]) {
      expect(snapshotProblems(tocada, 'de antes')).toEqual([
        expect.stringMatching(/no coincide con su huella/),
      ])
    }
  })

  it('T6-02: una foto anterior al formato se rechaza, sin atribuirle ningún proyecto', () => {
    const antigua: Record<string, unknown> = { ...enProduccion(REF) }
    for (const campo of ['formato', 'captura', 'proyecto', 'huella']) delete antigua[campo]
    const [motivo, ...resto] = snapshotProblems(antigua, 'de antes')
    expect(resto).toEqual([])
    expect(motivo).toMatch(/formato anterior a gate-snapshot\/v2: no registra de qué proyecto es/)
    expect(motivo).toMatch(/evidencia histórica; para una puerta, vuelve a tomarla/)
    expect(motivo).not.toMatch(/PRODUCCIÓN|proy…/)
    expect(snapshotProblems({ ...foto(), formato: 'gate-snapshot/v3' }, 'de antes')[0]).toMatch(
      /formato desconocido/,
    )
  })

  it('T6-03: una foto incompleta o incoherente se rechaza diciendo qué le falta', () => {
    const sinFilas: Record<string, unknown> = { ...foto() }
    delete sinFilas.filas
    const casos: Array<[unknown, RegExp]> = [
      [null, /no es una foto de la puerta/],
      [sinFilas, /está incompleta: faltan las filas/],
      [foto({ entorno: 'produccion', proyecto: null }), /falta el proyecto de producción/],
      [foto({ proyecto: REF }), /nombra un proyecto y una foto local no nombra ninguno/],
      [foto({ captura: 'no' }), /falta la captura/],
      [foto({ meta: { ...foto().meta, ahora: 'ayer' } }), /faltan los datos del instante/],
      [
        foto({ base: { etiqueta: 'a', ahora: '2026-09-18T19:00:00.000Z' } }),
        /falta la referencia completa de su foto base/,
      ],
      [foto({ estructura: { tablas: [] } }), /falta la estructura «columnas»/],
      [
        foto({ filas: { tickets: { pk: ['id'], columnas_nuevas: [], n: 3, filas: {} } } }),
        /faltan o no cuadran las filas de tickets/,
      ],
    ]
    for (const [f, motivo] of casos) {
      const problemas = snapshotProblems(f, 'de antes')
      expect(problemas).toHaveLength(1)
      expect(problemas[0]).toMatch(motivo)
    }
  })

  it('T6-04: el defecto — dos fotos locales pedidas como de producción no dan veredicto', () => {
    const a = foto()
    const b = despuesDe(a)
    expect(provenanceProblems(a, b, { kind: 'production', projectRef: INVENTADO })).toEqual([
      'Se pidió PRODUCCIÓN (proyecto aaaa…) y las dos fotos son de LOCAL (127.0.0.1:54322).',
    ])
    expect(provenanceProblems(a, b, LOCAL)).toEqual([])
  })

  it('T6-05: fotos de destinos o de proyectos distintos', () => {
    const a = enProduccion(REF)
    expect(provenanceProblems(a, despuesDe(a, { proyecto: OTRO }), PROD)).toEqual([
      'Las dos fotos son de proyectos distintos (proy… y otro…): una comparación se hace entre dos fotos del mismo proyecto.',
      'Se pidió PRODUCCIÓN (proyecto proy…) y la foto de después («prueba-despues») es de otro proyecto de producción (otro…).',
    ])
    const local = foto()
    expect(
      provenanceProblems(local, despuesDe(local, { entorno: 'produccion', proyecto: REF }), PROD),
    ).toEqual([
      'Las dos fotos son de destinos distintos: la de antes, de LOCAL (127.0.0.1:54322); la de después, de PRODUCCIÓN (proyecto proy…).',
      'Se pidió PRODUCCIÓN (proyecto proy…) y la foto de antes («prueba») es de LOCAL (127.0.0.1:54322).',
    ])
  })

  it('T6-06: fotos de un proyecto pedidas con la referencia de otro, o con --local', () => {
    const a = enProduccion(REF)
    const b = despuesDe(a)
    expect(provenanceProblems(a, b, { kind: 'production', projectRef: OTRO })).toEqual([
      'Se pidió PRODUCCIÓN (proyecto otro…) y las dos fotos son de otro proyecto de producción (proy…).',
    ])
    expect(provenanceProblems(a, b, LOCAL)).toEqual([
      'Se pidió LOCAL (127.0.0.1:54322) y las dos fotos son de PRODUCCIÓN (proyecto proy…).',
    ])
    expect(provenanceProblems(a, b, PROD)).toEqual([])
  })

  it('T6-07: la misma captura en los dos extremos, el orden invertido o el mismo instante', () => {
    const a = foto()
    const b = despuesDe(a)
    expect(provenanceProblems(a, a, LOCAL)).toEqual([expect.stringMatching(/misma captura/)])
    expect(provenanceProblems(a, structuredClone(a), LOCAL)).toEqual([
      expect.stringMatching(/misma captura/),
    ])
    expect(provenanceProblems(b, a, LOCAL)).toEqual([
      expect.stringMatching(/no es posterior a la de antes .*: el orden está invertido\.$/),
    ])
    expect(provenanceProblems(a, despuesDe(a, { meta: a.meta }), LOCAL)).toEqual([
      expect.stringMatching(/se tomaron en el mismo instante\.$/),
    ])
  })

  it('T6-08: con --base, la foto de después tiene que haberse tomado sobre ESA foto de antes', () => {
    const a = foto()
    const referencia = (s: Snapshot, huella = s.huella!) => ({
      etiqueta: s.etiqueta,
      ahora: s.meta.ahora,
      captura: s.captura!,
      huella,
    })
    expect(provenanceProblems(a, despuesDe(a, { base: referencia(a) }), LOCAL)).toEqual([])
    const otra = foto({
      captura: 'cccccccc-0000-4000-8000-00000000000c',
      etiqueta: 'otra',
      meta: { ...a.meta, ahora: '2026-09-18T19:00:00.000Z' },
    })
    expect(provenanceProblems(a, despuesDe(a, { base: referencia(otra) }), LOCAL)).toEqual([
      expect.stringMatching(/se tomó con --base de otra foto \(«otra»/),
    ])
    // La misma captura con otra huella: la foto de antes cambió después de servir de base.
    expect(
      provenanceProblems(a, despuesDe(a, { base: referencia(a, '0'.repeat(64)) }), LOCAL),
    ).toEqual([expect.stringMatching(/--base de otra foto/)])
  })

  it('T6-09: ningún motivo escribe una referencia de proyecto entera', () => {
    const a = enProduccion(REF)
    const motivos = [
      ...provenanceProblems(a, despuesDe(a, { proyecto: OTRO }), PROD),
      ...provenanceProblems(a, despuesDe(a), { kind: 'production', projectRef: OTRO }),
      ...provenanceProblems(a, despuesDe(a), LOCAL),
      ...provenanceProblems(foto(), despuesDe(foto()), PROD),
    ]
    expect(motivos.length).toBeGreaterThan(4)
    for (const m of motivos) {
      expect(m).not.toContain(REF)
      expect(m).not.toContain(OTRO)
    }
  })
})
