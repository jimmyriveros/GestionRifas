/**
 * Lo que pinta «Premios ganados» en cada situación (D-208, Etapa 2).
 *
 * Se renderiza con `react-dom/server`, que es lo que llega antes de hidratar:
 * ahí tiene que estar ya la verdad de cada estado. Es la forma de probar el
 * ERROR de lectura, que el navegador no puede provocar —la lectura ocurre en el
 * servidor— y que nunca puede convertirse en «sin premios» ni en «$0».
 *
 * Los datos se pasan ya leídos: qué filas y qué totales llegan lo decide la base
 * (`tests/db/prize-award-history.test.ts`); aquí se prueba qué hace la pantalla
 * con cada respuesta.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/seller/prizes',
  useSearchParams: () => new URLSearchParams(),
}))

const { PrizeAwardsView } = await import('@/features/prize-awards/components/PrizeAwardsView')
const { PRIZE_AWARDS_COPY: COPY } = await import('@/features/prize-awards/copy')

import type {
  AdminPrizeAward,
  PrizeAwardCoverageResult,
  PrizeAwardTotals,
  SellerPrizeAward,
} from '@/features/prize-awards/queries'
import type { PrizeAwardFilters } from '@/features/prize-awards/schemas'

const SIN_FILTROS: PrizeAwardFilters = { page: 1 }
const COBERTURA: PrizeAwardCoverageResult = {
  kind: 'ready',
  coverage: {
    historyStart: '2026-08-09',
    pendingDraws: 13,
    pendingFrom: '2026-08-10',
    pendingTo: '2026-08-24',
  },
}
const CERO: PrizeAwardTotals = { prizes: 0, clients: 0, knownAmount: 0, valuePending: 0 }

const BASE = {
  key: 'engine:1',
  origin: 'engine' as const,
  referenceDate: '2026-09-18',
  lotteryCode: 'bogota' as const,
  drawNumber: '2864',
  winningNumber: '0046',
  resultConflict: false,
  raffleId: 'rifa',
  raffleName: 'SORTEO CAMIONETA KIA 2027',
  ticketId: 'boleta',
  dailyNumber: '0046',
  weeklyNumber: '1111',
  matchField: 'daily_number' as const,
  matchedNumber: '0046',
  numbersChanged: false,
  prizeTitle: 'Premio diario',
  prizeCategory: 'daily' as const,
  prizeDigits: 'four' as const,
  rewardMode: 'fixed' as const,
  rewardOptions: [{ position: 1, description: null, amount: 500_000 }],
  knownAmount: 500_000,
  valuePending: false,
}

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
}

const RIFAS = [{ value: 'rifa', label: 'R001 · SORTEO CAMIONETA KIA 2027' }]

describe('los cuatro estados que no se pueden confundir', () => {
  it('P2V-01: un fallo de lectura se dice y ofrece reintentar, sin «sin premios» ni «$0»', () => {
    const salida = html(
      <PrizeAwardsView
        audience="seller"
        filters={SIN_FILTROS}
        result={{ kind: 'error' }}
        coverage={COBERTURA}
        client={null}
        raffles={RIFAS}
      />,
    )
    expect(salida).toContain(COPY.error.title)
    expect(salida).toContain('Reintentar')
    expect(salida).not.toContain(COPY.empty.title)
    expect(salida).not.toContain('data-slot="prize-awards-summary"')
    expect(salida).not.toMatch(/\$0\b/)
  })

  it('P2V-02: si la cobertura no se pudo leer, se dice, y la lista se pinta igual', () => {
    const salida = html(
      <PrizeAwardsView
        audience="seller"
        filters={SIN_FILTROS}
        result={{
          kind: 'ready',
          rows: [{ ...BASE, clientId: 'c1', clientName: 'Ana Torres' }],
          total: 1,
          page: 1,
          pageSize: 25,
          totals: { prizes: 1, clients: 1, knownAmount: 500_000, valuePending: 0 },
        }}
        coverage={{ kind: 'error' }}
        client={null}
        raffles={RIFAS}
      />,
    )
    expect(salida).toContain(COPY.coverageError)
    expect(salida).toContain('Ana Torres')
    // Sin la fecha de inicio, la descripción no inventa una.
    expect(salida).toContain('Los premios que ganaron tus clientes. La entrega')
  })

  it('P2V-03: unas fechas al revés no se consultan ni dan cero: se explican', () => {
    const salida = html(
      <PrizeAwardsView
        audience="seller"
        filters={{ dateFrom: '2026-09-10', dateTo: '2026-09-01', page: 1 }}
        result={null}
        coverage={COBERTURA}
        client={null}
        raffles={RIFAS}
      />,
    )
    expect(salida).toContain(COPY.reversed.title)
    expect(salida).not.toContain('data-slot="prize-awards-summary"')
  })

  it('P2V-04: sin premios, el estado vacío convive con la información pendiente', () => {
    const salida = html(
      <PrizeAwardsView
        audience="seller"
        filters={SIN_FILTROS}
        result={{ kind: 'ready', rows: [], total: 0, page: 1, pageSize: 25, totals: CERO }}
        coverage={COBERTURA}
        client={null}
        raffles={RIFAS}
      />,
    )
    expect(salida).toContain(COPY.empty.title)
    expect(salida).toContain('data-slot="prize-coverage-notice"')
    expect(salida).toContain('Hay 13 sorteos ya jugados sin resultado confirmado')
    // Sin filtros de rifa ni fechas, no hace falta aclarar el alcance.
    expect(salida).not.toContain('no solo de este filtro')
  })

  it('P2V-05: una página que no existe conserva los totales del conjunto', () => {
    const salida = html(
      <PrizeAwardsView
        audience="seller"
        filters={{ page: 9 }}
        result={{
          kind: 'ready',
          rows: [],
          total: 30,
          page: 9,
          pageSize: 25,
          totals: { prizes: 30, clients: 2, knownAmount: 15_000_000, valuePending: 1 },
        }}
        coverage={COBERTURA}
        client={null}
        raffles={RIFAS}
      />,
    )
    expect(salida).toContain(COPY.outOfRange.title)
    expect(salida).toContain('El historial tiene 30 premios en 2 páginas.')
    expect(salida).toContain('$15.000.000')
    expect(salida).toContain('href="/seller/prizes"')
  })
})

describe('los estados vacíos no afirman de más', () => {
  it('P2V-09: «este cliente no tiene premios» solo cuando el cliente es el único filtro', () => {
    const vacio = {
      kind: 'ready' as const,
      rows: [],
      total: 0,
      page: 1,
      pageSize: 25,
      totals: CERO,
    }
    const soloCliente = html(
      <PrizeAwardsView
        audience="seller"
        filters={{ clientId: 'c1', page: 1 }}
        result={vacio}
        coverage={COBERTURA}
        client={{ id: 'c1', name: 'Ana Torres' }}
        raffles={RIFAS}
      />,
    )
    expect(soloCliente).toContain(COPY.empty.clientTitle)

    // Con una rifa además, puede tenerlos en otra: se dice lo del filtro.
    const conRifa = html(
      <PrizeAwardsView
        audience="seller"
        filters={{ clientId: 'c1', raffleId: 'rifa', page: 1 }}
        result={vacio}
        coverage={COBERTURA}
        client={{ id: 'c1', name: 'Ana Torres' }}
        raffles={RIFAS}
      />,
    )
    expect(conRifa).not.toContain(COPY.empty.clientTitle)
    expect(conRifa).toContain(COPY.empty.filteredTitle)
  })
})

describe('los dos públicos', () => {
  it('P2V-06: el filtro de un cliente se dice y se puede quitar sin perder los demás', () => {
    const salida = html(
      <PrizeAwardsView
        audience="seller"
        filters={{ clientId: 'c1', raffleId: 'rifa', page: 1 }}
        result={{
          kind: 'ready',
          rows: [{ ...BASE, clientId: 'c1', clientName: 'Ana Torres' }],
          total: 1,
          page: 1,
          pageSize: 25,
          totals: { prizes: 1, clients: 1, knownAmount: 500_000, valuePending: 0 },
        }}
        coverage={COBERTURA}
        client={{ id: 'c1', name: 'Ana Torres' }}
        raffles={RIFAS}
      />,
    )
    expect(salida).toContain('Solo los premios de Ana Torres.')
    expect(salida).toContain('href="/seller/prizes?raffleId=rifa"')
    expect(salida).toContain('href="/seller/clients/c1"')
    expect(salida).toContain('href="/seller/tickets/boleta"')
  })

  it('P2V-07: el personal ve al vendedor, nunca una columna de cliente, y enlaza solo fichas que existen', () => {
    const filas: AdminPrizeAward[] = [
      { ...BASE, key: 'engine:1', sellerId: 'v1', sellerName: 'Julian Vargas' },
      { ...BASE, key: 'engine:2', sellerId: 'v9', sellerName: 'Ahora Administrador' },
    ]
    const salida = html(
      <PrizeAwardsView
        audience="staff"
        filters={SIN_FILTROS}
        result={{
          kind: 'ready',
          rows: filas,
          total: 2,
          page: 1,
          pageSize: 25,
          totals: { prizes: 2, clients: 2, knownAmount: 1_000_000, valuePending: 0 },
        }}
        coverage={COBERTURA}
        raffles={RIFAS}
        sellers={[{ value: 'v1', label: 'Julian Vargas' }]}
        linkableSellerIds={['v1']}
      />,
    )
    expect(salida).toContain('>Vendedor<')
    expect(salida).not.toContain('>Cliente<')
    expect(salida).toContain('href="/owner/sellers/v1"')
    expect(salida).not.toContain('href="/owner/sellers/v9"')
    expect(salida).toContain('Ahora Administrador')
    expect(salida).toContain('href="/owner/tickets/boleta"')
    expect(salida).not.toMatch(/\/seller\/|\/clients\//)
  })

  it('P2V-08: lo que requiere verificación se dice con palabras y el premio se queda', () => {
    const fila: SellerPrizeAward = {
      ...BASE,
      resultConflict: true,
      numbersChanged: true,
      clientId: 'c1',
      clientName: 'Ana Torres',
    }
    const salida = html(
      <PrizeAwardsView
        audience="seller"
        filters={SIN_FILTROS}
        result={{
          kind: 'ready',
          rows: [fila],
          total: 1,
          page: 1,
          pageSize: 25,
          totals: { prizes: 1, clients: 1, knownAmount: 500_000, valuePending: 0 },
        }}
        coverage={COBERTURA}
        client={null}
        raffles={RIFAS}
      />,
    )
    expect(salida).toContain(COPY.row.conflict)
    expect(salida).toContain(COPY.row.numbersChanged)
    expect(salida).toContain('$500.000')
  })
})
