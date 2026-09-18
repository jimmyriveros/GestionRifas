/**
 * La puerta del cargador de premios reconocidos (Etapa 4 de D-208, `RUNBOOK` §9.4).
 *
 * El cargador escribe dinero en el historial, y en producción no se ensaya: estas
 * pruebas fijan, sin red y sin credenciales, todo lo que tiene que cumplir una orden
 * contra el proyecto real —destino explícito y remoto, el proyecto esperado, la
 * organización escrita dos veces, una vista previa anterior con la misma huella—
 * y que la vista previa sigue siendo lo que pasa por omisión. El recorrido completo
 * contra una base, con el mismo flujo, está en
 * `tests/db/record-prize-awards-script.test.ts`, con `--local`.
 *
 * El RESOLVEDOR (`supabase-target.ts`) se prueba aislado: `dotenv` está simulado, así
 * que ninguna prueba lee `.env.local` ni ve una credencial real.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }))

import {
  assertAwardInputs,
  assertAwardsTarget,
  assertSamePreview,
  assessAwardsReport,
  AWARD_OUTCOME,
  AWARDS_EXIT,
  awardsErrorIsCertain,
  AwardsGateError,
  awardsPreviewHash,
  awardsTargetLabel,
  parseAwardsArgs,
  parseAwardsReport,
  stableJson,
  type AwardReportRow,
} from '../../scripts/record-prize-awards-guard'
import { resolveTarget } from '../../scripts/supabase-target'
import {
  CONFIRMED_AWARDS_BASIS,
  CONFIRMED_PRIZE_AWARDS,
  type DeclaredPrizeAwardInput,
} from '@/features/prize-awards/declared'

const ORG = 'abcdef12-2222-4333-8444-555555555555'
const REF = 'proyectoficticioabcd'
const HUELLA = 'a'.repeat(64)
const REMOTO = { isLocal: false, url: `https://${REF}.supabase.co` }
const LOCAL = { isLocal: true, url: 'http://127.0.0.1:54321' }

/** Una orden completa, con el destino y los extras que diga cada prueba. */
function orden(...extras: string[]): string[] {
  return [...extras, '--organization', ORG, '--confirm-organization', ORG]
}
const produccion = (...extras: string[]) => orden('--production', '--project-ref', REF, ...extras)

function rechaza(args: string[], mensaje: RegExp) {
  expect(() => parseAwardsArgs(args)).toThrow(AwardsGateError)
  expect(() => parseAwardsArgs(args)).toThrow(mensaje)
}

/** La fila que la base devolvería para una entrada, con el resultado que diga la prueba. */
function fila(
  entrada: DeclaredPrizeAwardInput,
  outcome: string,
  cambios: Partial<AwardReportRow> = {},
): AwardReportRow {
  return {
    daily_number: entrada.daily_number,
    weekly_number: entrada.weekly_number,
    lottery_code: entrada.lottery_code,
    reference_date: entrada.reference_date,
    matched_number: entrada.daily_number,
    prize_title: entrada.prize_title,
    amount: entrada.amount ?? null,
    in_kind_description: entrada.in_kind_description ?? null,
    outcome,
    problem: null,
    ...cambios,
  }
}
const informe = (outcome: string) => CONFIRMED_PRIZE_AWARDS.map((e) => fila(e, outcome))

describe('A1 — el destino se dice siempre, y uno solo', () => {
  it('A1-01: sin --local ni --production no se ejecuta nada', () => {
    rechaza(orden(), /Indica el destino/)
  })

  it('A1-02: --local y --production a la vez se rechazan', () => {
    rechaza(orden('--local', '--production', '--project-ref', REF), /un solo destino/)
  })

  it('A1-03: sin --apply es una vista previa, en los dos destinos', () => {
    expect(parseAwardsArgs(orden('--local'))).toEqual({
      target: 'local',
      organizationId: ORG,
      projectRef: null,
      apply: false,
      previewHash: null,
    })
    expect(parseAwardsArgs(produccion())).toEqual({
      target: 'production',
      organizationId: ORG,
      projectRef: REF,
      apply: false,
      previewHash: null,
    })
  })
})

describe('A2 — una errata no se convierte en otra orden', () => {
  it('A2-01: una opción desconocida se rechaza en vez de ignorarse', () => {
    rechaza(produccion('--aply'), /No reconozco «--aply»/)
    rechaza(orden('--prod'), /No reconozco «--prod»/)
    rechaza(orden('--local', '--raffle', ORG), /No reconozco «--raffle»/)
    rechaza(orden('--local', 'aplicar'), /No reconozco «aplicar»/)
  })

  it('A2-02: una opción repetida se rechaza', () => {
    rechaza([...orden('--local'), '--organization', ORG], /--organization está repetido/)
    rechaza(orden('--local', '--local'), /--local está repetido/)
    rechaza(produccion('--project-ref', REF), /--project-ref está repetido/)
  })

  it('A2-03: una opción sin valor se rechaza, también si detrás viene otra opción', () => {
    rechaza(['--local', '--organization'], /Falta el valor de --organization/)
    rechaza(
      ['--local', '--organization', '--confirm-organization', ORG],
      /Falta el valor de --organization/,
    )
  })
})

describe('A3 — la organización, escrita dos veces e idéntica, también en la vista previa', () => {
  it('A3-01: sin organización, o sin su confirmación, no se ejecuta nada', () => {
    rechaza(['--local'], /Falta --organization/)
    rechaza(['--local', '--organization', ORG], /--confirm-organization/)
  })

  it('A3-02: la organización tiene que ser un identificador', () => {
    rechaza(
      ['--local', '--organization', 'rifas', '--confirm-organization', 'rifas'],
      /identificador de la organización/,
    )
  })

  it('A3-03: la confirmación tiene que ser EXACTAMENTE la misma', () => {
    const otra = 'abcdef12-2222-4333-8444-555555555556'
    for (const confirmacion of [otra, ORG.toUpperCase(), `${ORG} `, ` ${ORG}`]) {
      rechaza(
        ['--local', '--organization', ORG, '--confirm-organization', confirmacion],
        /no coincide con --organization/,
      )
    }
  })

  it('A3-04: escrita en mayúsculas las dos veces, se usa en minúsculas', () => {
    const mayusculas = ORG.toUpperCase()
    expect(
      parseAwardsArgs([
        '--local',
        '--organization',
        mayusculas,
        '--confirm-organization',
        mayusculas,
      ]).organizationId,
    ).toBe(ORG)
  })
})

describe('A4 — producción nombra el proyecto que espera', () => {
  it('A4-01: --production sin --project-ref se rechaza', () => {
    rechaza(orden('--production'), /--project-ref/)
  })

  it('A4-02: --project-ref con --local es contradictorio', () => {
    rechaza(orden('--local', '--project-ref', REF), /solo se usa con --production/)
  })

  it('A4-03: la referencia son 20 letras minúsculas', () => {
    for (const ref of [
      'corta',
      REF.toUpperCase(),
      `${REF}x`,
      'proyecto-ficticio-ab',
      'proyectoficticio1234',
    ]) {
      rechaza(orden('--production', '--project-ref', ref), /20 letras minúsculas/)
    }
  })
})

describe('A5 — aplicar exige una vista previa anterior, en los DOS destinos', () => {
  it('A5-01: con todo, la orden se acepta', () => {
    expect(parseAwardsArgs(produccion('--apply', '--preview-hash', HUELLA))).toMatchObject({
      target: 'production',
      apply: true,
      previewHash: HUELLA,
      projectRef: REF,
    })
    expect(parseAwardsArgs(orden('--local', '--apply', '--preview-hash', HUELLA))).toMatchObject({
      target: 'local',
      apply: true,
      previewHash: HUELLA,
    })
  })

  it('A5-02: sin la huella, no se aplica: tampoco en local', () => {
    rechaza(produccion('--apply'), /vista previa anterior/)
    rechaza(orden('--local', '--apply'), /vista previa anterior/)
  })

  it('A5-03: la huella sin --apply se rechaza: sin --apply es una vista previa', () => {
    rechaza(produccion('--preview-hash', HUELLA), /solo se usa junto con --apply/)
  })

  it('A5-04: una huella que no es la de una vista previa se rechaza', () => {
    for (const huella of ['abc', 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63)]) {
      rechaza(produccion('--apply', '--preview-hash', huella), /64 caracteres hexadecimales/)
    }
  })
})

describe('A6 — el destino resuelto tiene que ser el pedido, y el proyecto el esperado', () => {
  const pedidoProduccion = { target: 'production' as const, projectRef: REF }
  const pedidoLocal = { target: 'local' as const, projectRef: null }

  it('A6-01: el proyecto remoto esperado, por https, es producción', () => {
    expect(() => assertAwardsTarget(pedidoProduccion, REMOTO, {})).not.toThrow()
  })

  it('A6-02: --production rechaza cualquier destino local, venga de donde venga', () => {
    expect(() => assertAwardsTarget(pedidoProduccion, LOCAL, {})).toThrow(/base local/)
    expect(() =>
      assertAwardsTarget(pedidoProduccion, REMOTO, { SUPABASE_TARGET: 'local' }),
    ).toThrow(/SUPABASE_TARGET=local/)
    for (const url of [
      `http://${REF}.supabase.co`,
      'https://127.0.0.1:54321',
      'http://127.0.0.1:54321',
      'https://localhost',
      'https://example.com',
      `https://${REF}.supabase.co.example.com`,
      'no-es-una-url',
    ]) {
      expect(() => assertAwardsTarget(pedidoProduccion, { isLocal: false, url }, {})).toThrow(
        AwardsGateError,
      )
    }
  })

  it('A6-03: otro proyecto de Supabase no es el esperado, aunque sea remoto', () => {
    for (const url of [
      'https://otroproyectoficticioab.supabase.co',
      `https://${REF}x.supabase.co`,
    ]) {
      expect(() => assertAwardsTarget(pedidoProduccion, { isLocal: false, url }, {})).toThrow(
        /no es el proyecto esperado/,
      )
    }
  })

  it('A6-04: --local contra un proyecto remoto se rechaza', () => {
    expect(() => assertAwardsTarget(pedidoLocal, REMOTO, {})).toThrow(/no es la base local/)
    expect(() => assertAwardsTarget(pedidoLocal, LOCAL, {})).not.toThrow()
  })

  it('A6-05: el nombre del destino no escribe la dirección ni la referencia entera', () => {
    const etiqueta = awardsTargetLabel(pedidoProduccion, REMOTO)
    expect(etiqueta).toBe('PRODUCCIÓN (proyecto proy…)')
    expect(etiqueta).not.toContain('supabase.co')
    expect(etiqueta).not.toContain(REF)
  })
})

describe('A7 — el resolvedor y la puerta, juntos y aislados (sin leer .env.local)', () => {
  const remoto = {
    NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'clave-publica-ficticia',
    SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio-ficticia',
    SEED_DEFAULT_PASSWORD: 'contrasena-ficticia',
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Lo mismo que hace el script: la orden, el destino resuelto y `SUPABASE_TARGET`. */
  function puerta(argv: string[], env: Record<string, string | undefined>) {
    const destino = resolveTarget(argv, env)
    const comprobar = () =>
      assertAwardsTarget(parseAwardsArgs(argv.slice(2)), destino, {
        SUPABASE_TARGET: env.SUPABASE_TARGET,
      })
    return { destino, comprobar }
  }

  it('A7-01: con --production y el entorno del proyecto, el resolvedor da el remoto y la puerta lo acepta', () => {
    const { destino, comprobar } = puerta(['node', 'script', ...produccion()], remoto)
    expect(destino).toMatchObject({ isLocal: false, url: remoto.NEXT_PUBLIC_SUPABASE_URL })
    expect(comprobar).not.toThrow()
  })

  it('A7-02: SUPABASE_TARGET=local convierte cualquier orden en local, y --production lo rechaza', () => {
    const env = { ...remoto, SUPABASE_TARGET: 'local' }
    const { destino, comprobar } = puerta(['node', 'script', ...produccion()], env)
    expect(destino.isLocal).toBe(true)
    expect(comprobar).toThrow(/base local/)
  })

  it('A7-03: un entorno que apunta a la base local no pasa por producción', () => {
    const env = { ...remoto, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }
    const { destino, comprobar } = puerta(['node', 'script', ...produccion()], env)
    expect(destino.isLocal).toBe(false)
    expect(comprobar).toThrow(/no es un proyecto remoto de Supabase/)
  })

  it('A7-04: --local da la base local aunque el entorno sea el del proyecto real', () => {
    const { destino, comprobar } = puerta(['node', 'script', ...orden('--local')], remoto)
    expect(destino).toMatchObject({ isLocal: true, url: 'http://127.0.0.1:54321' })
    expect(comprobar).not.toThrow()
  })

  it('A7-05: sin las variables del proyecto, el resolvedor termina sin imprimir ningún valor', () => {
    const salida = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`salida ${String(code)}`)
    })
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      resolveTarget(['node', 'script'], { SUPABASE_SERVICE_ROLE_KEY: 'secreto-ficticio' }),
    ).toThrow('salida 1')
    expect(salida).toHaveBeenCalledWith(1)
    expect(errores.mock.calls.flat().join(' ')).not.toContain('secreto-ficticio')
  })
})

describe('A8 — las entradas se comprueban antes de tocar la red', () => {
  const base = CONFIRMED_PRIZE_AWARDS[0]!
  const con = (cambios: Partial<DeclaredPrizeAwardInput>) => [{ ...base, ...cambios }]

  it('A8-01: la lista confirmada por el dueño pasa', () => {
    expect(() => assertAwardInputs(CONFIRMED_PRIZE_AWARDS, CONFIRMED_AWARDS_BASIS)).not.toThrow()
  })

  it('A8-02: números de boleta mal escritos', () => {
    for (const cambios of [
      { daily_number: '12345' },
      { weekly_number: '12A4' },
      { daily_number: '' },
    ]) {
      expect(() => assertAwardInputs(con(cambios), CONFIRMED_AWARDS_BASIS)).toThrow(
        /números de la boleta/,
      )
    }
  })

  it('A8-03: lotería, fecha y premio', () => {
    expect(() =>
      assertAwardInputs(con({ lottery_code: 'baloto' as never }), CONFIRMED_AWARDS_BASIS),
    ).toThrow(/lotería que no existe/)
    for (const fecha of ['03/09/2026', '2026-02-30', '2026-9-3']) {
      expect(() =>
        assertAwardInputs(con({ reference_date: fecha }), CONFIRMED_AWARDS_BASIS),
      ).toThrow(/fecha de referencia válida/)
    }
    for (const titulo of ['P', ' Premio diario', 'x'.repeat(81)]) {
      expect(() => assertAwardInputs(con({ prize_title: titulo }), CONFIRMED_AWARDS_BASIS)).toThrow(
        /nombre del premio/,
      )
    }
  })

  it('A8-04: lo que se ganó: importe o especie, dentro de sus límites', () => {
    expect(() =>
      assertAwardInputs([{ ...base, amount: undefined }], CONFIRMED_AWARDS_BASIS),
    ).toThrow(/no dice qué se ganó/)
    for (const importe of [0, -1, 500_000.5, 10_000_000_001]) {
      expect(() => assertAwardInputs(con({ amount: importe }), CONFIRMED_AWARDS_BASIS)).toThrow(
        /entero de pesos/,
      )
    }
    expect(() =>
      assertAwardInputs(con({ in_kind_description: ' Moto' }), CONFIRMED_AWARDS_BASIS),
    ).toThrow(/2 a 160 caracteres/)
  })

  it('A8-05: la misma boleta, sorteo y premio dos veces se rechaza', () => {
    expect(() => assertAwardInputs([base, { ...base }], CONFIRMED_AWARDS_BASIS)).toThrow(
      /repite la boleta/,
    )
  })

  it('A8-06: lista vacía, demasiado larga o sin respaldo', () => {
    expect(() => assertAwardInputs([], CONFIRMED_AWARDS_BASIS)).toThrow(/ninguna entrada/)
    const muchas = Array.from({ length: 101 }, (_, i) => ({
      ...base,
      daily_number: String(i).padStart(4, '0'),
    }))
    expect(() => assertAwardInputs(muchas, CONFIRMED_AWARDS_BASIS)).toThrow(/más de 100/)
    expect(() => assertAwardInputs(CONFIRMED_PRIZE_AWARDS, 'corto')).toThrow(/respaldo/)
  })
})

describe('A9 — el informe de la base se lee con su forma, o no se lee', () => {
  it('A9-01: el informe de siempre se lee tal cual', () => {
    const filas = informe(AWARD_OUTCOME.wouldRecord)
    expect(parseAwardsReport(JSON.parse(JSON.stringify(filas)))).toEqual(filas)
  })

  it('A9-02: cualquier otra forma se rechaza', () => {
    const buena = informe(AWARD_OUTCOME.wouldRecord)[0]!
    for (const malo of [
      null,
      {},
      'texto',
      [null],
      [{ ...buena, outcome: null }],
      [{ ...buena, amount: '500000' }],
      [{ ...buena, amount: 1.5 }],
      [{ ...buena, daily_number: 3427 }],
    ]) {
      expect(() => parseAwardsReport(malo)).toThrow(/no es el informe del cargador/)
    }
  })
})

describe('A10 — cada informe se contrasta con las entradas, fila por fila', () => {
  const entradas = CONFIRMED_PRIZE_AWARDS

  it('A10-01: una vista previa limpia se puede aplicar, con $1.000.000', () => {
    const r = assessAwardsReport(entradas, informe(AWARD_OUTCOME.wouldRecord), 'preview')
    expect(r).toEqual({
      counts: { wouldRecord: 2, alreadyStored: 0, recorded: 0, rejected: 0 },
      problems: [],
      amount: 1_000_000,
    })
  })

  it('A10-02: una fila rechazada se cuenta y no suma dinero', () => {
    const filas = informe(AWARD_OUTCOME.wouldRecord)
    filas[1] = fila(entradas[1]!, AWARD_OUTCOME.rejected, {
      problem: 'No hay ninguna coincidencia registrada de esa boleta en ese sorteo.',
    })
    const r = assessAwardsReport(entradas, filas, 'preview')
    expect(r.counts.rejected).toBe(1)
    expect(r.amount).toBe(500_000)
    expect(r.problems).toEqual([])
  })

  it('A10-03: una fila que no corresponde a su entrada es un problema', () => {
    const filas = informe(AWARD_OUTCOME.wouldRecord)
    filas.reverse()
    expect(assessAwardsReport(entradas, filas, 'preview').problems).toHaveLength(2)
    expect(assessAwardsReport(entradas, filas.slice(0, 1), 'preview').problems[0]).toMatch(
      /1 filas para 2 entradas/,
    )
  })

  it('A10-04: otro importe, o un número fotografiado que no es de la boleta, es un problema', () => {
    const filas = informe(AWARD_OUTCOME.alreadyStored)
    filas[0] = fila(entradas[0]!, AWARD_OUTCOME.alreadyStored, { amount: 400_000 })
    filas[1] = fila(entradas[1]!, AWARD_OUTCOME.alreadyStored, { matched_number: '0000' })
    const problemas = assessAwardsReport(entradas, filas, 'reconcile').problems
    expect(problemas).toEqual([
      'Fila 1: la base tiene $400.000 y la entrada dice $500.000.',
      'Fila 2: el número fotografiado no es ninguno de los dos de la boleta.',
    ])
  })

  it('A10-05: cada momento admite sus resultados y ninguno más', () => {
    expect(
      assessAwardsReport(entradas, informe(AWARD_OUTCOME.recorded), 'preview').problems,
    ).toHaveLength(2)
    expect(assessAwardsReport(entradas, informe(AWARD_OUTCOME.recorded), 'apply').problems).toEqual(
      [],
    )
    expect(
      assessAwardsReport(entradas, informe(AWARD_OUTCOME.notWritten), 'apply').problems,
    ).toHaveLength(2)
    expect(
      assessAwardsReport(entradas, informe(AWARD_OUTCOME.wouldRecord), 'reconcile').problems,
    ).toHaveLength(2)
    expect(assessAwardsReport(entradas, informe(AWARD_OUTCOME.alreadyStored), 'reconcile')).toEqual(
      {
        counts: { wouldRecord: 0, alreadyStored: 2, recorded: 0, rejected: 0 },
        problems: [],
        amount: 1_000_000,
      },
    )
  })

  it('A10-06: un problema anotado sin rechazar la fila también se dice', () => {
    const filas = informe(AWARD_OUTCOME.wouldRecord)
    filas[0] = fila(entradas[0]!, AWARD_OUTCOME.wouldRecord, { problem: 'algo' })
    expect(assessAwardsReport(entradas, filas, 'preview').problems[0]).toMatch(/sin rechazarla/)
  })
})

describe('A11 — la huella liga destino, organización, entradas y vista previa, estable', () => {
  const base = {
    target: 'production' as const,
    projectRef: REF,
    organizationId: ORG,
    basis: CONFIRMED_AWARDS_BASIS,
    entries: CONFIRMED_PRIZE_AWARDS,
    preview: informe(AWARD_OUTCOME.wouldRecord),
  }

  it('A11-01: es SHA-256 en minúsculas y la misma entrada da la misma huella', () => {
    expect(awardsPreviewHash(base)).toMatch(/^[0-9a-f]{64}$/)
    expect(awardsPreviewHash(base)).toBe(awardsPreviewHash({ ...base }))
  })

  it('A11-02: no depende del orden de las claves ni de si falta un campo vacío', () => {
    const desordenada = base.preview.map((f) =>
      Object.fromEntries(Object.entries(f).reverse()),
    ) as AwardReportRow[]
    const sinEspecie = base.entries.map(({ in_kind_description: _omitido, ...resto }) => resto)
    expect(awardsPreviewHash({ ...base, preview: desordenada })).toBe(awardsPreviewHash(base))
    expect(awardsPreviewHash({ ...base, entries: sinEspecie })).toBe(awardsPreviewHash(base))
    expect(awardsPreviewHash({ ...base, organizationId: ORG.toUpperCase() })).toBe(
      awardsPreviewHash(base),
    )
  })

  it('A11-03: cambia con el destino, el proyecto, la organización y el respaldo', () => {
    const referencia = awardsPreviewHash(base)
    for (const cambio of [
      { target: 'local' as const, projectRef: null },
      { projectRef: 'otroproyectoficticio' },
      { organizationId: 'abcdef12-2222-4333-8444-555555555556' },
      { basis: `${CONFIRMED_AWARDS_BASIS} ` },
    ]) {
      expect(awardsPreviewHash({ ...base, ...cambio })).not.toBe(referencia)
    }
  })

  it('A11-04: cambia con cualquier campo de las entradas o de la vista previa', () => {
    const referencia = awardsPreviewHash(base)
    const entrada = base.entries[0]!
    for (const cambio of [
      { amount: 400_000 },
      { prize_title: 'Premio semanal' },
      { reference_date: '2026-09-04' },
      { daily_number: '3428' },
    ]) {
      expect(
        awardsPreviewHash({ ...base, entries: [{ ...entrada, ...cambio }, base.entries[1]!] }),
      ).not.toBe(referencia)
    }
    const campos: Array<Partial<AwardReportRow>> = [
      { outcome: AWARD_OUTCOME.alreadyStored },
      { outcome: AWARD_OUTCOME.rejected, problem: 'x' },
      { amount: 400_000 },
      { matched_number: '7702' },
      { in_kind_description: 'Moto' },
    ]
    for (const cambio of campos) {
      const filas = [...base.preview]
      filas[1] = { ...filas[1]!, ...cambio }
      expect(awardsPreviewHash({ ...base, preview: filas })).not.toBe(referencia)
    }
    expect(awardsPreviewHash({ ...base, preview: [...base.preview].reverse() })).not.toBe(
      referencia,
    )
  })

  it('A11-05: la representación estable ordena claves y se niega a lo que no representa', () => {
    expect(stableJson({ b: 1, a: [true, null, 'x'], c: { z: 1, y: 2 } })).toBe(
      '{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}',
    )
    expect(() => stableJson(Number.NaN)).toThrow(TypeError)
    expect(() => stableJson(() => 1)).toThrow(TypeError)
  })
})

describe('A12 — lo que se aplica es lo que se revisó', () => {
  it('A12-01: la misma huella deja aplicar', () => {
    expect(() => assertSamePreview(HUELLA, HUELLA)).not.toThrow()
  })

  it('A12-02: otra huella, o ninguna, no aplica nada', () => {
    expect(() => assertSamePreview(HUELLA, 'b'.repeat(64))).toThrow(
      /No se escribió nada: vuelve a ejecutar la vista previa/,
    )
    expect(() => assertSamePreview(null, HUELLA)).toThrow(/--preview-hash/)
  })
})

describe('A13 — una respuesta incierta no se da por fallida, y cada salida dice una cosa', () => {
  it('A13-01: un rechazo de PostgreSQL deshizo la transacción; la red, no se sabe', () => {
    for (const code of ['23514', 'P0001', '42501', '57014']) {
      expect(awardsErrorIsCertain({ code })).toBe(true)
    }
    for (const code of ['', null, undefined, 'PGRST000', '08006']) {
      expect(awardsErrorIsCertain({ code })).toBe(false)
    }
  })

  it('A13-02: los cuatro códigos de salida son distintos', () => {
    expect(new Set(Object.values(AWARDS_EXIT)).size).toBe(4)
    expect(AWARDS_EXIT.ok).toBe(0)
  })
})

describe('A14 — ningún identificador de producción vive en el código, y el orden es el de la puerta', () => {
  const raiz = path.resolve(import.meta.dirname, '../..')
  const archivos = ['scripts/record-prize-awards.ts', 'scripts/record-prize-awards-guard.ts']
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

  it('A14-01: ni una organización ni un proyecto escritos en el script ni en la puerta', () => {
    for (const archivo of archivos) {
      const texto = readFileSync(path.join(raiz, archivo), 'utf8')
      expect(texto, archivo).not.toMatch(UUID)
      expect(texto, archivo).not.toMatch(/[a-z]{20}\.supabase\.co/)
    }
  })

  it('A14-02: el script consulta la puerta antes de resolver el destino y compara la huella antes de escribir', () => {
    const script = readFileSync(path.join(raiz, archivos[0]!), 'utf8')
    const main = script.slice(script.indexOf('async function main'))
    const antes = (a: string, b: string) => {
      expect(main.indexOf(a), a).toBeGreaterThan(-1)
      expect(main.indexOf(a), `${a} antes que ${b}`).toBeLessThan(main.indexOf(b))
    }
    antes('parseAwardsArgs(', 'resolveTarget()')
    antes('assertAwardInputs(', 'resolveTarget()')
    antes('assertAwardsTarget(', 'createClient')
    antes('assertSamePreview(', 'call(true)')
    antes('call(true)', "assessAwardsReport(ENTRIES, stored, 'reconcile')")
  })
})
