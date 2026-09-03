/**
 * El recuadro de loterias no puede retrasar el resto del Panel (D-155, BR-L25).
 *
 * QUE SE PRUEBA AQUI, y por que asi. La promesa de esta etapa es de TIEMPO:
 * aunque la lectura local de loterias tarde, el contenido principal del Panel
 * tiene que salir igual. Una prueba que solo mirase el HTML final no diria
 * nada, porque el HTML final es el mismo con o sin limite de Suspense. Por eso
 * se renderiza con `renderToPipeableStream` y se anotan los INSTANTES en que
 * llega cada trozo: es el mismo mecanismo que usa Next para servir la pagina.
 *
 * La consulta se sustituye por un doble lento a proposito. No hace falta base
 * de datos: lo que se demuestra es que el limite existe y que el armazon se
 * envia sin esperarla.
 *
 * La medida real, con la aplicacion construida y PostgREST retrasado 1,5 s,
 * esta en `docs/TEST_RESULTS.md`.
 */
import { PassThrough } from 'node:stream'

import { renderToPipeableStream } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { LotteryDashboard } from '@/features/lottery/dashboard'

const control = vi.hoisted(() => ({ delayMs: 0 }))

vi.mock('@/features/lottery/queries', () => ({
  getLotteryDashboard: async (): Promise<LotteryDashboard> => {
    await new Promise((resolve) => setTimeout(resolve, control.delayMs))
    return { kind: 'empty' }
  },
}))

const { LotteryResultsSection } =
  await import('@/features/lottery/components/LotteryResultsSection')

const CONTENIDO_PRINCIPAL = 'Resumen por vendedor'
const HUECO = 'lottery-results-loading'
const RECUADRO_RESUELTO = 'Todavía no hay resultados oficiales'

type Trozo = { at: number; text: string }

/** Una pagina con el mismo reparto que el Panel: contenido propio + recuadro. */
function PanelDePrueba() {
  return (
    <div>
      <h1>Hola, Owner</h1>
      <LotteryResultsSection audience="staff" ticketBasePath="/owner/tickets" />
      <h2>{CONTENIDO_PRINCIPAL}</h2>
    </div>
  )
}

async function renderStreaming(node: React.ReactElement): Promise<Trozo[]> {
  const trozos: Trozo[] = []
  const inicio = Date.now()
  await new Promise<void>((resolve, reject) => {
    const salida = new PassThrough()
    salida.on('data', (chunk: Buffer) => {
      trozos.push({ at: Date.now() - inicio, text: chunk.toString('utf8') })
    })
    salida.on('end', () => resolve())
    salida.on('error', reject)
    const { pipe } = renderToPipeableStream(node, {
      onShellReady() {
        pipe(salida)
      },
      onError(error) {
        reject(error)
      },
    })
  })
  return trozos
}

function primerInstanteCon(trozos: Trozo[], marca: string): number | null {
  let acumulado = ''
  for (const trozo of trozos) {
    acumulado += trozo.text
    if (acumulado.includes(marca)) return trozo.at
  }
  return null
}

/**
 * El ARMAZON: todo lo que sale antes de que llegue el recuadro resuelto.
 *
 * Se corta por contenido y no por «el primer trozo»: cuantos trozos ocupe el
 * armazon depende de su tamaño en bytes, y una tarjeta con dos huecos en vez
 * de cuatro barras ya lo parte en dos. Lo que esta prueba defiende no es el
 * troceado, es que el contenido principal NO espera a la consulta.
 */
function armazon(trozos: Trozo[], marcaDelRecuadro: string): string {
  let acumulado = ''
  for (const trozo of trozos) {
    if ((acumulado + trozo.text).includes(marcaDelRecuadro)) break
    acumulado += trozo.text
  }
  return acumulado
}

describe('el recuadro de loterias vive en su propio limite de Suspense (D-155)', () => {
  it('con la consulta lenta, el contenido principal sale primero y el recuadro despues', async () => {
    control.delayMs = 300
    const trozos = await renderStreaming(<PanelDePrueba />)

    // El armazon: todo lo que no es el recuadro, mas el hueco que lo reserva.
    const shell = armazon(trozos, RECUADRO_RESUELTO)
    expect(shell, 'el contenido principal tiene que ir en el armazon').toContain(
      CONTENIDO_PRINCIPAL,
    )
    expect(shell, 'y el hueco del recuadro, tambien').toContain(HUECO)
    expect(shell, 'el recuadro resuelto NO puede ir en el armazon').not.toContain(
      RECUADRO_RESUELTO,
    )

    const principalAt = primerInstanteCon(trozos, CONTENIDO_PRINCIPAL)
    const recuadroAt = primerInstanteCon(trozos, RECUADRO_RESUELTO)
    expect(principalAt).not.toBeNull()
    expect(recuadroAt).not.toBeNull()

    // El contenido principal no espera a la consulta; el recuadro si.
    expect(principalAt!, `salio a los ${principalAt} ms`).toBeLessThan(150)
    expect(recuadroAt!, `llego a los ${recuadroAt} ms`).toBeGreaterThanOrEqual(250)
    expect(trozos.length, 'tiene que llegar en mas de un trozo').toBeGreaterThan(1)
  })

  it('con la consulta instantanea el resultado final es el mismo', async () => {
    control.delayMs = 0
    const trozos = await renderStreaming(<PanelDePrueba />)
    const html = trozos.map((t) => t.text).join('')

    expect(html).toContain(CONTENIDO_PRINCIPAL)
    expect(html).toContain(RECUADRO_RESUELTO)
  })

  it('el hueco anuncia lo que esta pasando a quien no lo ve', async () => {
    control.delayMs = 200
    const trozos = await renderStreaming(<PanelDePrueba />)
    const shell = armazon(trozos, RECUADRO_RESUELTO)

    expect(shell).toContain('aria-busy="true"')
    expect(shell).toContain('Buscando los resultados oficiales…')
    // El titulo real va en el armazon: no aparece de golpe al resolverse.
    expect(shell).toContain('Resultados y próxima lotería')
  })
})
