/**
 * LA RECUPERACIÓN CON LOS PERMISOS DE ANTES, sin base (I-192, D-240).
 *
 * `scripts/earning-recovery.ts` ejecuta el script de recuperación y devuelve a las
 * funciones que ese script recrea el ACL que tenían en la foto de antes de migrar. Aquí
 * se prueba lo que decide sin conectarse: qué funciones toca —las que nombra el propio
 * script—, qué foto sirve de referencia y qué sentencias salen de comparar dos ACL.
 *
 * El defecto que encontró P3: el script deja los privilegios del repositorio, y en el
 * proyecto alojado 7 funciones tenían además `EXECUTE` para `service_role`. La regla que
 * fija esta suite es la contraria de «concederlo por si acaso»: se concede SOLO lo que la
 * foto tenía, y una función que no lo tenía no lo recibe.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }))

import { RECOVERY_SQL } from '../../scripts/earning-recovery-check'
import {
  functionDifferences,
  parseOptions,
  privilegeStatements,
  recreatedFunctions,
  referenceFunctions,
  referenceProblems,
  type FunctionState,
} from '../../scripts/earning-recovery'
import type { Snapshot } from '../../scripts/gate-db'
import { SNAPSHOT_FORMAT, snapshotDigest } from '../../scripts/gate-diff'

const REF = 'proyectoficticioabcd'
const LOCAL = { kind: 'local', projectRef: null } as const
const PROD = { kind: 'production', projectRef: REF } as const

const fn = (
  firma: string,
  acl: string | null,
  extra: Partial<FunctionState> = {},
): FunctionState => ({
  firma,
  acl,
  propietario: 'postgres',
  cuerpo: `cuerpo-de-${firma}`,
  ...extra,
})
const mapa = (...fs: FunctionState[]) => new Map(fs.map((f) => [f.firma, f]))

function foto(parcial: Partial<Snapshot> = {}): Snapshot {
  const s: Snapshot = {
    formato: SNAPSHOT_FORMAT,
    captura: '11111111-1111-4111-8111-111111111111',
    etiqueta: 'antes-de-migrar',
    entorno: 'local',
    proyecto: null,
    base: null,
    meta: {
      ahora: '2026-09-30T03:00:00.000Z',
      reloj: '2026-09-30T03:00:00.000Z',
      snapshot: '1:1:',
      version: '17',
      usuario: 'postgres',
      replica: false,
    },
    migraciones: [
      { version: '0076', name: 'orden_en_la_base' },
      { version: '0077', name: 'raffle_short_code_mil' },
    ],
    estructura: {
      tablas: [],
      columnas: [],
      restricciones: [],
      indices: [],
      disparadores: [],
      politicas: [],
      funciones: [
        {
          firma: 'commission_summary(uuid)',
          acl: '{postgres=X/postgres,authenticated=X/postgres}',
          propietario: 'postgres',
          cuerpo: 'c1',
        },
      ],
      tipos: [],
      vistas: [],
      extensiones: [],
      cron: [],
      vault: [],
      publicaciones: [],
      privilegios_por_defecto: [],
      esquema_public: [],
    },
    filas: { tickets: { pk: ['id'], columnas_nuevas: [], n: 0, filas: {} } },
    hechos: {},
    ...parcial,
  }
  return { ...s, huella: snapshotDigest(s) }
}

describe('V1 — qué funciones toca: las que nombra el propio script', () => {
  const script = readFileSync(RECOVERY_SQL, 'utf8')
  const firmas = recreatedFunctions(script)

  it('V1-01: salen de las líneas `revoke all on function`, con la firma completa y sin repetir', () => {
    expect(firmas.length).toBeGreaterThan(0)
    expect(new Set(firmas).size).toBe(firmas.length)
    for (const f of firmas) expect(f).toMatch(/^[a-z_0-9]+\([a-z_0-9,]*\)$/)
    // Cada función que el script crea está en la lista: ninguna se queda sin su ACL.
    const creadas = [
      ...script.matchAll(/^CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\(/gm),
    ].map((m) => m[1]!)
    expect(creadas.length).toBe(firmas.length)
    for (const nombre of creadas) expect(firmas.some((f) => f.startsWith(`${nombre}(`))).toBe(true)
  })

  it('V1-02: están las siete que P3 encontró sin service_role', () => {
    for (const f of [
      'commission_rate_for_seller(uuid,uuid,uuid,integer)',
      'commission_rate_for(uuid,integer)',
      'commission_summary(uuid)',
      'memberships_sync_commission()',
      'memberships_validate_commission()',
      'organizations_seed_commission_tiers()',
      'team_set_commission_model(uuid,commission_model,bigint)',
    ]) {
      expect(firmas).toContain(f)
    }
  })

  it('V1-03: un script sin funciones, o con una repetida, no se acepta', () => {
    expect(() => recreatedFunctions('select 1;')).toThrow(/no nombra ninguna función/)
    const dos =
      'revoke all on function f(uuid) from public;\nrevoke all on function f(uuid) from public;\n'
    expect(() => recreatedFunctions(dos)).toThrow(/dos veces f\(uuid\)/)
  })
})

describe('V2 — la foto de referencia: del mismo destino y de antes de migrar', () => {
  it('V2-01: una foto completa, del destino pedido y en 0077, sirve', () => {
    expect(referenceProblems(foto(), LOCAL)).toEqual([])
    expect(referenceProblems(foto({ entorno: 'produccion', proyecto: REF }), PROD)).toEqual([])
  })

  it('V2-02: una foto de otro destino o de otro proyecto no sirve', () => {
    expect(referenceProblems(foto(), PROD)[0]).toMatch(
      /es de LOCAL .* y esta orden es para PRODUCCIÓN/,
    )
    expect(referenceProblems(foto({ entorno: 'produccion', proyecto: REF }), LOCAL)[0]).toMatch(
      /del mismo destino/,
    )
    expect(
      referenceProblems(foto({ entorno: 'produccion', proyecto: 'otroproyectoficticio' }), PROD)[0],
    ).toMatch(/otro proyecto de producción/)
  })

  it('V2-03: una foto tomada DESPUÉS de migrar, o antes de la 0077, no es la referencia', () => {
    const migrada = foto({
      migraciones: [
        { version: '0077', name: 'a' },
        { version: '0078', name: 'b' },
        { version: '0079', name: 'c' },
      ],
    })
    expect(referenceProblems(migrada, LOCAL)[0]).toMatch(/su última migración es 0079, no 0077/)
    expect(
      referenceProblems(foto({ migraciones: [{ version: '0076', name: 'a' }] }), LOCAL)[0],
    ).toMatch(/es 0076, no 0077/)
  })

  it('V2-04: una foto tocada, de un formato anterior o sin funciones se rechaza', () => {
    const tocada = { ...foto(), etiqueta: 'otra' }
    expect(referenceProblems(tocada, LOCAL)[0]).toMatch(/no coincide con su huella/)
    const vieja = { ...foto() } as Record<string, unknown>
    delete vieja.formato
    expect(referenceProblems(vieja, LOCAL)[0]).toMatch(/formato anterior/)
    expect(
      referenceProblems(foto({ estructura: { ...foto().estructura, funciones: [] } }), LOCAL)[0],
    ).toMatch(/no trae las funciones/)
    expect(referenceProblems('no es una foto', LOCAL)[0]).toMatch(/no es una foto de la puerta/)
  })

  it('V2-05: las funciones de la foto se leen por su firma', () => {
    expect(referenceFunctions(foto()).get('commission_summary(uuid)')).toEqual({
      firma: 'commission_summary(uuid)',
      acl: '{postgres=X/postgres,authenticated=X/postgres}',
      propietario: 'postgres',
      cuerpo: 'c1',
    })
  })
})

describe('V3 — los permisos: exactamente los de la foto, y solo en las funciones recreadas', () => {
  const F = 'commission_rate_for(uuid,integer)'
  const G = 'commission_summary(uuid)'
  const SOLO_DUENO = '{postgres=X/postgres}'
  const CON_SERVICIO = '{postgres=X/postgres,service_role=X/postgres}'

  it('V3-01: el caso del proyecto alojado — le falta service_role y la foto lo tenía: se concede', () => {
    const r = privilegeStatements([F], mapa(fn(F, SOLO_DUENO)), mapa(fn(F, CON_SERVICIO)))
    expect(r.problems).toEqual([])
    expect(r.statements).toEqual([`grant execute on function public.${F} to "service_role"`])
  })

  it('V3-02: el caso de la pila local — la foto NO tenía service_role: no se concede nada', () => {
    const r = privilegeStatements([F], mapa(fn(F, SOLO_DUENO)), mapa(fn(F, SOLO_DUENO)))
    expect(r).toEqual({ statements: [], problems: [] })
  })

  it('V3-03: nunca sale un grant de algo que la foto no tenía, sea cual sea el ACL de ahora', () => {
    const ahora = [
      SOLO_DUENO,
      CON_SERVICIO,
      '{postgres=X/postgres,authenticated=X/postgres,anon=X/postgres}',
      null,
    ]
    for (const acl of ahora) {
      const r = privilegeStatements([F], mapa(fn(F, acl)), mapa(fn(F, SOLO_DUENO)))
      expect(r.statements.filter((s) => s.startsWith('grant'))).toEqual([])
    }
  })

  it('V3-04: lo que le sobra respecto de la foto se revoca', () => {
    const r = privilegeStatements(
      [G],
      mapa(
        fn(
          G,
          '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,anon=X/postgres}',
        ),
      ),
      mapa(fn(G, '{postgres=X/postgres,authenticated=X/postgres}')),
    )
    expect(r.statements.sort()).toEqual([
      `revoke execute on function public.${G} from "anon"`,
      `revoke execute on function public.${G} from "service_role"`,
    ])
  })

  it('V3-05: una función sin ACL explícito vale como «dueño y PUBLIC», en la foto y en la base', () => {
    expect(privilegeStatements([F], mapa(fn(F, SOLO_DUENO)), mapa(fn(F, null))).statements).toEqual(
      [`grant execute on function public.${F} to public`],
    )
    expect(privilegeStatements([F], mapa(fn(F, null)), mapa(fn(F, SOLO_DUENO))).statements).toEqual(
      [`revoke execute on function public.${F} from public`],
    )
  })

  it('V3-06: solo las funciones recreadas; otra que difiera no se toca aquí', () => {
    const r = privilegeStatements(
      [F],
      mapa(fn(F, SOLO_DUENO), fn(G, SOLO_DUENO)),
      mapa(fn(F, SOLO_DUENO), fn(G, CON_SERVICIO)),
    )
    expect(r.statements).toEqual([])
  })

  it('V3-07: si la función no está, no es la de la foto o cambió de dueño, no se tocan sus permisos', () => {
    const referencia = mapa(fn(F, CON_SERVICIO))
    expect(privilegeStatements([F], mapa(), referencia)).toEqual({
      statements: [],
      problems: [`${F}: el script tenía que recrearla y no existe.`],
    })
    expect(privilegeStatements([F], mapa(fn(F, SOLO_DUENO)), mapa()).problems[0]).toMatch(
      /no estaba en la foto de referencia/,
    )
    expect(
      privilegeStatements([F], mapa(fn(F, SOLO_DUENO, { cuerpo: 'otro' })), referencia),
    ).toEqual({ statements: [], problems: [`${F}: su cuerpo no es el de la foto de referencia.`] })
    expect(
      privilegeStatements(
        [F],
        mapa(fn(F, SOLO_DUENO, { propietario: 'supabase_admin' })),
        referencia,
      ).problems[0],
    ).toMatch(/su dueño es supabase_admin y en la foto era postgres/)
  })
})

describe('V4 — la comprobación final: todas las funciones, contra la foto', () => {
  const F = 'a(uuid)'
  const G = 'b()'

  it('V4-01: iguales —también con el ACL escrito en otro orden o concedido por otro— no hay diferencias', () => {
    expect(
      functionDifferences(
        mapa(fn(F, '{service_role=X/postgres,postgres=X/postgres}'), fn(G, null)),
        mapa(
          fn(F, '{postgres=X/postgres,service_role=X/supabase_admin}'),
          fn(G, '{postgres=X/postgres,=X/postgres}'),
        ),
      ),
    ).toEqual([])
  })

  it('V4-02: una función que falta, que sobra, con otros permisos, otro cuerpo u otro dueño, se dice', () => {
    expect(functionDifferences(mapa(fn(F, null)), mapa(fn(F, null), fn(G, null)))).toEqual([
      `${G}: estaba en la foto y no existe`,
    ])
    expect(functionDifferences(mapa(fn(F, null), fn(G, null)), mapa(fn(F, null)))).toEqual([
      `${G}: existe y no estaba en la foto`,
    ])
    expect(functionDifferences(mapa(fn(F, '{postgres=X/postgres}')), mapa(fn(F, null)))).toEqual([
      `${F}: permisos distintos de los de la foto`,
    ])
    expect(functionDifferences(mapa(fn(F, null, { cuerpo: 'x' })), mapa(fn(F, null)))).toEqual([
      `${F}: cuerpo distinto del de la foto`,
    ])
    expect(
      functionDifferences(mapa(fn(F, null, { propietario: 'otro' })), mapa(fn(F, null))),
    ).toContain(`${F}: otro dueño`)
  })
})

describe('V5 — la orden', () => {
  it('V5-01: la foto, un solo destino, y un lock_timeout con forma de tiempo', () => {
    expect(parseOptions(['foto.json', '--local'])).toEqual({
      target: LOCAL,
      reference: 'foto.json',
      lockTimeout: '5s',
      onlyPrivileges: false,
    })
    expect(
      parseOptions([
        'foto.json',
        '--production',
        '--project-ref',
        REF,
        '--lock-timeout',
        '900ms',
        '--solo-privilegios',
      ]),
    ).toEqual({
      target: PROD,
      reference: 'foto.json',
      lockTimeout: '900ms',
      onlyPrivileges: true,
    })
    expect(() => parseOptions(['--local'])).toThrow(/Falta la foto/)
    expect(() => parseOptions(['foto.json'])).toThrow(/un solo destino/)
    expect(() => parseOptions(['foto.json', '--local', '--lock-timeout', "5s'; drop"])).toThrow(
      /tiempo como 900ms o 5s/,
    )
    expect(() => parseOptions(['foto.json', '--local', '--lock-timeout', '0s'])).toThrow(
      /tiempo como/,
    )
    expect(() => parseOptions(['foto.json', '--local', '--forzar'])).toThrow(
      /No reconozco «--forzar»/,
    )
  })
})
