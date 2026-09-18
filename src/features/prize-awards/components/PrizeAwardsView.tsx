import { CalendarIcon, InfoIcon, TrophyIcon } from 'lucide-react'
import Link from 'next/link'

import { DataTablePagination } from '@/components/data/DataTablePagination'
import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Notice } from '@/components/feedback/Notice'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { OfflineRetry } from '@/features/pwa/components/OfflineRetry'
import { ReportFilters } from '@/features/reports/components/ReportFilters'

import {
  PRIZE_AWARDS_COPY as COPY,
  coverageApplies,
  coverageNotice,
  outOfRangeDescription,
  prizeAwardsDescription,
} from '../copy'
import type {
  AdminPrizeAward,
  PrizeAwardCoverageResult,
  PrizeAwardPage,
  SellerPrizeAward,
} from '../queries'
import { prizeAwardHasFilters, prizeAwardsHref, type PrizeAwardFilters } from '../schemas'
import { PrizeAwardsList } from './PrizeAwardsList'
import { PrizeAwardsSummary } from './PrizeAwardsSummary'

/**
 * «Premios ganados», la pantalla entera, para los dos portales (D-208, Etapa 2).
 *
 * Es el patrón de `ReportsView` (D-051): una pantalla, parametrizada por su
 * público. Cada página LEE lo suyo —el vendedor por `seller_prize_awards`, el
 * personal por `admin_prize_awards`— y se lo pasa aquí ya consultado, así que
 * el contrato de datos de cada portal sigue siendo el suyo: esta vista no
 * pregunta nada a la base.
 *
 * `audience` NO ES UN PERMISO. Elige qué columna y qué textos se pintan; quien
 * decide qué filas llegan es PostgreSQL, con la sesión (BR-J21).
 *
 * CUATRO SITUACIONES QUE NO SE PUEDEN CONFUNDIR:
 *
 *   * NO SE PUDO LEER: se dice y se ofrece reintentar. Nunca «sin premios» ni
 *     «$0», que serían afirmar algo que no se sabe.
 *   * NO HAY PREMIOS con este filtro: un estado vacío que lo dice.
 *   * FALTA INFORMACIÓN de algún sorteo: el aviso de cobertura, aparte, con lo
 *     que la base puede afirmar (BR-J22).
 *   * HAY PREMIOS CON VALOR PENDIENTE: el cuarto indicador y cada fila lo dicen;
 *     el total en dinero nunca lo rellena.
 */

type FilterOption = { value: string; label: string }

type CommonProps = {
  filters: PrizeAwardFilters
  coverage: PrizeAwardCoverageResult
  raffles: FilterOption[]
}

type SellerViewProps = CommonProps & {
  audience: 'seller'
  /** `null` si las fechas están al revés: no se consultó nada. */
  result: PrizeAwardPage<SellerPrizeAward> | null
  /** El cliente del filtro, leído con la RLS del vendedor. */
  client: { id: string; name: string } | null
}

type StaffViewProps = CommonProps & {
  audience: 'staff'
  result: PrizeAwardPage<AdminPrizeAward> | null
  sellers: FilterOption[]
  /** Los vendedores que tienen ficha (ver `PrizeAwardsList`). */
  linkableSellerIds: readonly string[]
}

export type PrizeAwardsViewProps = SellerViewProps | StaffViewProps

const PATHS = {
  seller: { base: '/seller/prizes', tickets: '/seller/tickets' },
  staff: { base: '/owner/prizes', tickets: '/owner/tickets' },
} as const

export function PrizeAwardsView(props: PrizeAwardsViewProps) {
  const { audience, filters, coverage, raffles } = props
  const paths = PATHS[audience]
  const historyStart = coverage.kind === 'ready' ? coverage.coverage.historyStart : null

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} description={prizeAwardsDescription(audience, historyStart)} />

      <CoverageNotice coverage={coverage} filters={filters} />

      <ReportFilters
        fields={audience === 'staff' ? ['raffle', 'seller', 'dates'] : ['raffle', 'dates']}
        raffles={raffles}
        sellers={props.audience === 'staff' ? props.sellers : undefined}
        dateLabels={{ from: COPY.filters.dateFrom, to: COPY.filters.dateTo }}
        extraKeys={audience === 'seller' ? ['clientId'] : []}
      />

      {props.audience === 'seller' && props.client ? (
        <Notice
          tone="neutral"
          action={
            <Button asChild variant="outline" size="sm">
              <Link
                href={prizeAwardsHref(paths.base, { ...filters, clientId: undefined, page: 1 })}
              >
                {COPY.clientFilter.clear}
              </Link>
            </Button>
          }
        >
          {COPY.clientFilter.text(props.client.name)}
        </Notice>
      ) : null}

      <Body {...props} />
    </div>
  )
}

function CoverageNotice({
  coverage,
  filters,
}: {
  coverage: PrizeAwardCoverageResult
  filters: PrizeAwardFilters
}) {
  if (coverage.kind === 'error') {
    return (
      <Notice tone="neutral" icon={<InfoIcon />}>
        {COPY.coverageError}
      </Notice>
    )
  }
  if (!coverageApplies(coverage.coverage, filters)) return null

  // La cuenta es de la organización: con un filtro de rifa o de fechas, el
  // aviso lo aclara. Un filtro de vendedor o de cliente no cambia los sorteos.
  const filteredByScope = Boolean(filters.raffleId ?? filters.dateFrom ?? filters.dateTo)
  return (
    <Notice tone="info" icon={<InfoIcon />}>
      <span data-slot="prize-coverage-notice">
        {coverageNotice(coverage.coverage, filteredByScope)}
      </span>
    </Notice>
  )
}

function Body(props: PrizeAwardsViewProps) {
  const { audience, filters, result } = props
  const paths = PATHS[audience]

  if (result === null) {
    return (
      <EmptyState
        icon={<CalendarIcon className="size-8" aria-hidden />}
        title={COPY.reversed.title}
        description={COPY.reversed.description}
      />
    )
  }

  if (result.kind === 'error') {
    return (
      <Card data-slot="prize-awards-error" className="gap-4">
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-heading-h4">{COPY.error.title}</h2>
            <p className="text-body-small text-muted-foreground">{COPY.error.description}</p>
          </div>
          {/* Recarga la misma dirección, con sus filtros; sin JavaScript, el
              enlace hace lo mismo. 44 px también desde `sm` (D-161). */}
          <OfflineRetry href={prizeAwardsHref(paths.base, filters)} className="sm:h-11" />
        </CardContent>
      </Card>
    )
  }

  const filtered = prizeAwardHasFilters(filters)

  if (result.totals.prizes === 0 && result.rows.length === 0) {
    return <NoAwards {...props} filtered={filtered} />
  }

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize))

  return (
    <div className="space-y-6">
      <PrizeAwardsSummary totals={result.totals} />

      {result.rows.length === 0 ? (
        // Una página que no existe: los indicadores de arriba siguen siendo
        // los del conjunto entero, y aquí se dice cuántas páginas hay.
        <EmptyState
          icon={<TrophyIcon className="size-8" aria-hidden />}
          title={COPY.outOfRange.title}
          description={outOfRangeDescription(result.totals.prizes, pages, filtered)}
          action={
            <Button asChild>
              <Link href={prizeAwardsHref(paths.base, { ...filters, page: 1 })}>
                {COPY.outOfRange.action}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <AwardsList {...props} />
          <DataTablePagination
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
            items="prizes"
          />
        </>
      )}
    </div>
  )
}

/**
 * La lista de SU público: el vendedor con sus clientes, el personal con sus
 * vendedores. Se estrecha por `audience` para que cada una reciba su propio
 * tipo de fila, sin conversiones.
 */
function AwardsList(props: PrizeAwardsViewProps) {
  if (props.audience === 'seller') {
    if (props.result?.kind !== 'ready') return null
    return (
      <PrizeAwardsList
        audience="seller"
        awards={props.result.rows}
        ticketBasePath={PATHS.seller.tickets}
        clientBasePath="/seller/clients"
      />
    )
  }

  if (props.result?.kind !== 'ready') return null
  return (
    <PrizeAwardsList
      audience="staff"
      awards={props.result.rows}
      ticketBasePath={PATHS.staff.tickets}
      sellerBasePath="/owner/sellers"
      linkableSellerIds={props.linkableSellerIds}
    />
  )
}

function NoAwards(props: PrizeAwardsViewProps & { filtered: boolean }) {
  // «Este cliente no tiene premios» solo es cierto si el cliente es el ÚNICO
  // filtro: con una rifa o unas fechas puede tenerlos fuera de ellas.
  const onlyClient = !props.filters.raffleId && !props.filters.dateFrom && !props.filters.dateTo
  if (props.audience === 'seller' && props.client && onlyClient) {
    return (
      <EmptyState
        icon={<TrophyIcon className="size-8" aria-hidden />}
        title={COPY.empty.clientTitle}
        description={COPY.empty.clientDescription}
      />
    )
  }

  if (props.filtered) {
    return (
      <EmptyState
        icon={<TrophyIcon className="size-8" aria-hidden />}
        title={COPY.empty.filteredTitle}
        description={
          props.audience === 'seller' ? COPY.empty.filteredSeller : COPY.empty.filteredStaff
        }
      />
    )
  }

  return (
    <EmptyState
      icon={<TrophyIcon className="size-8" aria-hidden />}
      title={COPY.empty.title}
      description={props.audience === 'seller' ? COPY.empty.seller : COPY.empty.staff}
    />
  )
}
