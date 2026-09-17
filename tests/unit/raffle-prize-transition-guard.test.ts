/**
 * La puerta del script de transición contra producción (Entrega 5, D-205).
 *
 * El script es la única vía para convertir la rifa real, y convertirla no se
 * deshace. Estas pruebas fijan lo que hace falta para que una orden contra
 * producción se ejecute —destino explícito y remoto, una vista previa anterior,
 * `--apply` y el identificador de la rifa escrito dos veces— y que la vista
 * previa sigue siendo lo que pasa por omisión.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  assertPreviewUnchanged,
  assertTransitionTarget,
  parseTransitionArgs,
  TransitionGateError,
  transitionErrorIsCertain,
  transitionTargetLabel,
} from '../../scripts/raffle-prize-transition-guard'

const ORG = '11111111-2222-4333-8444-555555555555'
const RIFA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const HUELLA = 'a'.repeat(64)
const REMOTO = { isLocal: false, url: 'https://ejemploproyectoficticio.supabase.co' }
const LOCAL = { isLocal: true, url: 'http://127.0.0.1:54321' }

/** Una orden completa, con el destino y los extras que diga cada prueba. */
function orden(...extras: string[]): string[] {
  return [
    ...extras,
    '--organization',
    ORG,
    '--raffle',
    RIFA,
    '--name',
    'SORTEO DE PRUEBA 2026',
    '--status',
    'active',
    '--start',
    '2026-07-01',
    '--end',
    '2026-12-31',
  ]
}

function rechaza(args: string[], mensaje: RegExp) {
  expect(() => parseTransitionArgs(args)).toThrow(TransitionGateError)
  expect(() => parseTransitionArgs(args)).toThrow(mensaje)
}

describe('G1 — el destino se dice siempre, y uno solo', () => {
  it('G1-01: sin --local ni --production no se ejecuta nada', () => {
    rechaza(orden(), /Indica el destino/)
  })

  it('G1-02: --local y --production a la vez se rechazan', () => {
    rechaza(orden('--local', '--production'), /un solo destino/)
  })

  it('G1-03: sin --apply es una vista previa, también en producción', () => {
    const local = parseTransitionArgs(orden('--local'))
    const produccion = parseTransitionArgs(orden('--production'))
    expect(local).toMatchObject({ target: 'local', apply: false })
    expect(produccion).toMatchObject({
      target: 'production',
      apply: false,
      previewHash: null,
      confirmRaffle: null,
    })
  })
})

describe('G2 — una errata no se convierte en otra orden', () => {
  it('G2-01: una opción desconocida se rechaza en vez de ignorarse', () => {
    rechaza(orden('--production', '--aply'), /No reconozco «--aply»/)
    rechaza(orden('--prod'), /No reconozco «--prod»/)
  })

  it('G2-02: una opción repetida se rechaza', () => {
    rechaza([...orden('--production'), '--raffle', RIFA], /--raffle está repetido/)
    rechaza(orden('--production', '--apply', '--apply'), /--apply está repetido/)
  })

  it('G2-03: una opción sin valor se rechaza, también si detrás viene otra opción', () => {
    rechaza(['--production', '--raffle'], /Falta el valor de --raffle/)
    rechaza(
      ['--production', '--organization', '--raffle', RIFA],
      /Falta el valor de --organization/,
    )
  })

  it('G2-04: faltan datos de la rifa, identificadores o fechas mal escritos', () => {
    rechaza(['--production', '--raffle', RIFA], /Faltan datos de la rifa/)
    rechaza(
      orden('--production').map((a) => (a === ORG ? 'org-real' : a)),
      /identificador de la organización/,
    )
    rechaza(
      orden('--production').map((a) => (a === RIFA ? 'rifa' : a)),
      /identificador de la rifa/,
    )
    rechaza(
      orden('--production').map((a) => (a === 'active' ? 'activa' : a)),
      /draft, active, closed o cancelled/,
    )
    rechaza(
      orden('--production').map((a) => (a === '2026-07-01' ? '01/07/2026' : a)),
      /formato AAAA-MM-DD/,
    )
    rechaza(
      orden('--production').map((a) => (a === 'SORTEO DE PRUEBA 2026' ? '   ' : a)),
      /no puede ir vacío/,
    )
  })
})

describe('G3 — aplicar en producción exige una vista previa anterior y el identificador dos veces', () => {
  it('G3-01: con todo, la orden se acepta', () => {
    const pedido = parseTransitionArgs(
      orden('--production', '--apply', '--preview-hash', HUELLA, '--confirm-raffle', RIFA),
    )
    expect(pedido).toMatchObject({
      target: 'production',
      apply: true,
      previewHash: HUELLA,
      confirmRaffle: RIFA,
      raffleId: RIFA,
      organizationId: ORG,
      name: 'SORTEO DE PRUEBA 2026',
      status: 'active',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
    })
  })

  it('G3-02: sin la huella de la vista previa, no', () => {
    rechaza(orden('--production', '--apply', '--confirm-raffle', RIFA), /vista previa anterior/)
  })

  it('G3-03: sin repetir el identificador de la rifa, no', () => {
    rechaza(orden('--production', '--apply', '--preview-hash', HUELLA), /--confirm-raffle/)
  })

  it('G3-04: el identificador repetido tiene que ser EXACTAMENTE el mismo', () => {
    const otra = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeef'
    for (const confirmacion of [otra, RIFA.toUpperCase(), `${RIFA} `, ` ${RIFA}`]) {
      rechaza(
        orden(
          '--production',
          '--apply',
          '--preview-hash',
          HUELLA,
          '--confirm-raffle',
          confirmacion,
        ),
        /no coincide con --raffle/,
      )
    }
  })

  it('G3-05: una huella que no es la de una vista previa se rechaza', () => {
    for (const huella of ['abc', 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63)]) {
      rechaza(
        orden('--production', '--apply', '--preview-hash', huella, '--confirm-raffle', RIFA),
        /64 caracteres hexadecimales/,
      )
    }
  })

  it('G3-06: la huella y la confirmación sin --apply se rechazan: sin --apply es una vista previa', () => {
    rechaza(orden('--production', '--preview-hash', HUELLA), /solo se usan junto con --apply/)
    rechaza(orden('--production', '--confirm-raffle', RIFA), /solo se usan junto con --apply/)
  })

  it('G3-07: en local, aplicar no exige huella ni confirmación, pero las comprueba si llegan', () => {
    expect(parseTransitionArgs(orden('--local', '--apply'))).toMatchObject({
      target: 'local',
      apply: true,
    })
    rechaza(orden('--local', '--apply', '--confirm-raffle', ORG), /no coincide con --raffle/)
  })
})

describe('G4 — el destino resuelto tiene que ser el pedido', () => {
  const produccion = { target: 'production' as const }
  const local = { target: 'local' as const }

  it('G4-01: un proyecto remoto de Supabase por https es producción', () => {
    expect(() => assertTransitionTarget(produccion, REMOTO, {})).not.toThrow()
  })

  it('G4-02: --production contra la base local se rechaza, venga de donde venga', () => {
    expect(() => assertTransitionTarget(produccion, LOCAL, {})).toThrow(/base local/)
    expect(() => assertTransitionTarget(produccion, REMOTO, { SUPABASE_TARGET: 'local' })).toThrow(
      /SUPABASE_TARGET=local/,
    )
  })

  it('G4-03: --production contra algo que no es un proyecto remoto de Supabase se rechaza', () => {
    for (const url of [
      'http://ejemploproyectoficticio.supabase.co',
      'https://127.0.0.1:54321',
      'https://localhost',
      'https://example.com',
      'https://supabase.co.example.com',
      'no-es-una-url',
    ]) {
      expect(() => assertTransitionTarget(produccion, { isLocal: false, url }, {})).toThrow(
        TransitionGateError,
      )
    }
  })

  it('G4-04: --local contra un proyecto remoto se rechaza', () => {
    expect(() => assertTransitionTarget(local, REMOTO, {})).toThrow(/no es la base local/)
    expect(() => assertTransitionTarget(local, LOCAL, {})).not.toThrow()
  })

  it('G4-05: el nombre del destino no escribe la dirección del proyecto', () => {
    const etiqueta = transitionTargetLabel(produccion, REMOTO)
    expect(etiqueta).toBe('PRODUCCIÓN (proyecto ejem…)')
    expect(etiqueta).not.toContain('supabase.co')
    expect(etiqueta).not.toContain('ejemploproyectoficticio')
  })
})

describe('G5 — lo que se aplica es lo que se revisó', () => {
  it('G5-01: la misma huella deja aplicar', () => {
    expect(() => assertPreviewUnchanged({ previewHash: HUELLA }, HUELLA)).not.toThrow()
  })

  it('G5-02: otra huella no aplica nada y pide revisar la vista previa nueva', () => {
    expect(() => assertPreviewUnchanged({ previewHash: HUELLA }, 'b'.repeat(64))).toThrow(
      /No se aplicó nada: vuelve a ejecutar la vista previa/,
    )
  })

  it('G5-03: sin huella que comparar (solo en local) no se exige', () => {
    expect(() => assertPreviewUnchanged({ previewHash: null }, HUELLA)).not.toThrow()
  })
})

describe('G6 — una respuesta incierta no se da por fallida', () => {
  it('G6-01: un rechazo de PostgreSQL deshizo la transacción', () => {
    for (const code of ['23514', 'P0001', '42501', '57014', '40001', '22023']) {
      expect(transitionErrorIsCertain({ code })).toBe(true)
    }
  })

  it('G6-02: la red, una pasarela o una conexión perdida dejan la duda', () => {
    for (const code of ['', null, undefined, 'PGRST000', 'PGRST301', '08006', '08003']) {
      expect(transitionErrorIsCertain({ code })).toBe(false)
    }
  })
})

describe('G7 — ningún identificador de producción vive en el código', () => {
  const raiz = path.resolve(import.meta.dirname, '../..')
  const archivos = [
    'scripts/raffle-prize-transition.ts',
    'scripts/raffle-prize-transition-guard.ts',
  ]
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

  it('G7-01: ni una rifa ni una organización escritas en el script ni en la puerta', () => {
    for (const archivo of archivos) {
      const texto = readFileSync(path.join(raiz, archivo), 'utf8')
      expect(texto, archivo).not.toMatch(UUID)
      expect(texto, archivo).not.toMatch(/\.supabase\.co\//)
    }
  })

  it('G7-02: el script consulta la puerta ANTES de resolver el destino', () => {
    const script = readFileSync(path.join(raiz, archivos[0]!), 'utf8')
    const main = script.slice(script.indexOf('async function main'))
    expect(main.indexOf('parseTransitionArgs(')).toBeGreaterThan(-1)
    expect(main.indexOf('parseTransitionArgs(')).toBeLessThan(main.indexOf('resolveTarget()'))
    expect(main.indexOf('assertTransitionTarget(')).toBeLessThan(main.indexOf('createClient'))
    expect(main.indexOf('assertPreviewUnchanged(')).toBeLessThan(main.indexOf('run(true)'))
  })
})
