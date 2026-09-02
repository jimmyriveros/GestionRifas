/**
 * El Panel no consulta internet, y esto lo demuestra sobre el grafo de
 * imports REAL (BR-L20, BR-L26, D-162).
 *
 * POR QUE ASI Y NO CON UN ESPIA
 *
 * Un espia sobre `fetch` solo prueba que la ruta ejercida por ESA prueba no
 * salio a la red. Lo que hay que garantizar es mas fuerte: que desde las dos
 * paginas del Panel **no se puede llegar** a un modulo que descargue. Eso es
 * una propiedad del grafo de modulos, y se comprueba recorriendolo.
 *
 * Es la misma familia de comprobacion que `L-82` (D-155): un defecto de este
 * tipo compila, pasa las pruebas de pantalla y no da sintoma hasta que una
 * fuente oficial se cae y el Panel entero se queda colgado.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')
const SRC = path.join(ROOT, 'src')

/** Modulos que salen a internet. Ninguno puede alcanzarse desde el Panel. */
const MODULOS_QUE_DESCARGAN = [
  'src/features/lottery/fetch.ts',
  'src/features/lottery/adapters.ts',
  'src/features/lottery/alternative-adapters.ts',
  'src/features/lottery/consensus.ts',
  'src/features/lottery/sync.ts',
  'src/features/lottery/job.ts',
]

const PAGINAS_DEL_PANEL = [
  'src/app/(protected)/owner/dashboard/page.tsx',
  'src/app/(protected)/seller/dashboard/page.tsx',
]

function resolverImport(spec: string, desde: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(desde), spec)
  else return null
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidato = base + ext
    if (existsSync(candidato)) return candidato
  }
  return existsSync(base) && /\.tsx?$/.test(base) ? base : null
}

/** Todos los modulos alcanzables desde `entrada`, imports dinamicos incluidos. */
function grafoDesde(entrada: string): Set<string> {
  const vistos = new Set<string>()
  const cola = [entrada]
  while (cola.length > 0) {
    const archivo = cola.shift()
    if (!archivo || vistos.has(archivo)) continue
    vistos.add(archivo)
    const codigo = readFileSync(archivo, 'utf8')
    for (const match of codigo.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const destino = resolverImport(match[1] ?? '', archivo)
      if (destino) cola.push(destino)
    }
  }
  return vistos
}

const relativo = (absoluto: string) => path.relative(ROOT, absoluto).split(path.sep).join('/')

describe('el Panel no puede llegar a una descarga externa (BR-L20)', () => {
  for (const pagina of PAGINAS_DEL_PANEL) {
    it(`${pagina} no alcanza ningun modulo que descargue`, () => {
      const grafo = [...grafoDesde(path.join(ROOT, pagina))].map(relativo)
      const alcanzados = MODULOS_QUE_DESCARGAN.filter((modulo) => grafo.includes(modulo))
      expect(alcanzados).toEqual([])
    })

    it(`${pagina} no contiene ninguna llamada a fetch()`, () => {
      const conFetch = [...grafoDesde(path.join(ROOT, pagina))]
        .filter((archivo) =>
          /\bfetch\s*\(|node:https?\b|undici/.test(readFileSync(archivo, 'utf8')),
        )
        .map(relativo)
      expect(conFetch).toEqual([])
    })

    it(`${pagina} lee las loterias detras de su limite de Suspense`, () => {
      // D-155: el contenido principal no espera por el recuadro. Si alguien
      // devuelve `getLotteryDashboard` al `Promise.all`, compila y pasa las
      // pruebas de pantalla, y el defecto vuelve sin sintoma.
      const codigo = readFileSync(path.join(ROOT, pagina), 'utf8')
      expect(codigo).toContain('LotteryResultsSection')
      expect(codigo).not.toContain('getLotteryDashboard')
    })
  }

  it('el unico sitio que enciende las fuentes alternativas es el job', () => {
    const encendidos = [...grafoDesde(path.join(ROOT, 'src/features/lottery/job.ts'))]
      .concat([...grafoDesde(path.join(ROOT, PAGINAS_DEL_PANEL[0] ?? ''))])
      .filter((archivo) => readFileSync(archivo, 'utf8').includes('enableAlternativeSources: true'))
      .map(relativo)
    expect(encendidos).toEqual(['src/features/lottery/job.ts'])
  })

  it('el recuadro sigue haciendo dos consultas locales como maximo', () => {
    const codigo = readFileSync(path.join(ROOT, 'src/features/lottery/queries.ts'), 'utf8')
    // Una de programacion y una de coincidencias (BR-L25). Ni una mas.
    const consultas = [...codigo.matchAll(/\.from\(/g)].length
    expect(consultas).toBeLessThanOrEqual(2)
    // Y las dos comparten el plazo unico.
    expect(codigo).toContain('LOTTERY_DASHBOARD_TIMEOUT_MS')
  })
})
