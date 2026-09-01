import { AlertTriangleIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/PageHeader'
import { InstallPrompt } from '@/features/pwa/components/InstallPrompt'
import { percentageOf, buildCollectionBreakdown } from '@/features/dashboard/collection-breakdown'
import { CollectionStatusCard } from '@/features/dashboard/components/CollectionStatusCard'
import { CollectionTrendCard } from '@/features/dashboard/components/CollectionTrendCard'
import { DateRangeSelect } from '@/features/dashboard/components/DateRangeSelect'
import { FinancialSummaryCard } from '@/features/dashboard/components/FinancialSummaryCard'
import { QuickActionsCard } from '@/features/dashboard/components/QuickActionsCard'
import { RecentActivityCard } from '@/features/dashboard/components/RecentActivityCard'
import { SellerKpis } from '@/features/dashboard/components/SellerKpis'
import { TicketsOverviewCard } from '@/features/dashboard/components/TicketsOverviewCard'
import {
  comparePeriods,
  parseDashboardRange,
  rangeLength,
  resolveDashboardRange,
} from '@/features/dashboard/date-range'
import {
  getSellerActivity,
  getSellerDashboard,
  getSellerPartialTicketTotals,
} from '@/features/dashboard/seller-queries'
import { LotteryResultsSection } from '@/features/lottery/components/LotteryResultsSection'
import { getCommissionContext, getFirstTierRate } from '@/features/commissions/queries'
import { getOwnTeamStatus } from '@/features/team/queries'
import { requireRole } from '@/lib/auth/guards'
import { formatDateRangeEs, todayBogota } from '@/lib/dates'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

/**
 * Panel del vendedor (D-112).
 *
 * QUE CIFRA MIRA QUE. El periodo de arriba manda sobre lo que PASO —el dinero
 * recaudado y su tendencia dia a dia—; el inventario y la cobranza son una foto
 * de HOY y no se mueven al cambiarlo. Es la separacion que pidio el encargo, y
 * la unica posible: la base de datos guarda el estado actual de cada boleta, no
 * el que tenia hace siete dias.
 *
 * TODO SE DIBUJA EN EL SERVIDOR. Las dos consultas nuevas van dentro del mismo
 * `Promise.all` que ya existia, de modo que la pantalla sigue costando UNA
 * espera y no siete; y los graficos son SVG sin JavaScript, asi que no hay
 * momento en el que se vean ceros mientras llegan los datos reales.
 *
 * LO QUE SI SALIO DE ESA ESPERA es el recuadro de loterias (D-155): entra por
 * `LotteryResultsSection`, en su propio limite de Suspense, para que una lectura
 * lenta suya no retrase estas siete piezas.
 */
export default async function SellerDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const [membership, params] = await Promise.all([requireRole(['seller']), searchParams])

  const rangeKey = parseDashboardRange(single(params.range))
  const range = resolveDashboardRange(rangeKey, todayBogota())

  const [dashboard, comisiones, firstTierRate, own, partialTotals, activity] = await Promise.all([
    getSellerDashboard(),
    getCommissionContext(),
    getFirstTierRate(),
    // BR-G13, BR-G24: quien no pertenece a un equipo cobra la mitad del precio;
    // dentro de un equipo, por tramos o una cifra fija. Hace falta saberlo
    // aunque todavia no haya cobrado ninguna boleta, que es justo cuando no hay
    // fila de comision que leer.
    getOwnTeamStatus(membership.profileId),
    getSellerPartialTicketTotals(),
    getSellerActivity(range),
  ])

  const { totals } = dashboard

  // La comision es por rifa (BR-G04): sin rifa activa no hay ninguna de la que
  // hablar, y el indicador cae en la regla general en vez de inventar una cifra.
  //
  // OJO CON LA FILA VACIA: `commission_summary` devuelve fila tambien para quien
  // todavia no ha cobrado ninguna boleta, y ahi su `rate` vale 0 porque el
  // primer tramo empieza en la boleta 1. Tomar ese cero como «tu ganancia por
  // boleta» le diria a un vendedor nuevo que no gana nada. Por eso la fila solo
  // manda cuando hay boletas cobradas, y si no, se aplica la regla que le toca
  // (BR-G13), igual que hacia la tarjeta «Tu ganancia» que esto sustituye.
  const commission = comisiones.bySeller.get(membership.profileId) ?? null
  const hasEarnings = commission !== null && commission.ticketsPaid > 0
  const halfPrice = Math.floor((comisiones.raffle?.ticketPrice ?? 0) / 2)

  // La regla que le toca cuando todavia no hay fila que leer. El orden es el de
  // BR-G13/BR-G24 y las tres ramas son distintas: a quien cobra una cifra fija
  // no se le puede ofrecer el primer tramo, que fue lo que hizo esta pantalla
  // hasta que existio el modelo fijo.
  const rateSinVentas = !own.belongsToTeam
    ? halfPrice
    : own.commissionModel === 'fixed_per_ticket'
      ? (own.fixedCommissionAmount ?? 0)
      : firstTierRate

  const earningPerTicket = hasEarnings ? commission.rate : rateSinVentas

  // El siguiente tramo solo existe para quien cobra por tramos y aun le queda
  // uno (BR-G02, BR-G13). Es lo unico que se conserva de la tarjeta «Tu
  // ganancia» ademas del dinero: sin ello, subir de nivel dejaria de verse.
  const nextTier =
    commission !== null &&
    commission.byTiers &&
    commission.ticketsToNext !== null &&
    commission.nextRate !== null
      ? { ticketsToNext: commission.ticketsToNext, rate: commission.nextRate }
      : null

  // `null` significa que habia demasiadas boletas abonadas para leerlas una a
  // una; entonces el dinero se muestra sin separar «Pagadas» de «Abonadas».
  const detailed = partialTotals !== null
  const breakdown = buildCollectionBreakdown(
    totals,
    partialTotals ?? { salePrice: 0, paidAmount: 0 },
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title={`Hola, ${membership.fullName}`}
        description="Resumen de tu actividad"
        actions={
          <DateRangeSelect value={rangeKey} rangeLabel={formatDateRangeEs(range.from, range.to)} />
        }
      />

      {/* No es una tarjeta de metrica, es un aviso: son boletas que el vendedor
          todavia NO puede vender y por eso se dice arriba, con lo que hay que
          hacer, en vez de como una cifra mas de inventario. */}
      {totals.ticketsPendingApproval > 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <AlertTriangleIcon className="size-4 shrink-0" aria-hidden />
          Tienes {totals.ticketsPendingApproval} boleta(s) esperando la aprobación de tu
          administrador. Todavía no puedes venderlas.
        </p>
      ) : null}

      {/* Arriba, no al final (D-123). Va DESPUÉS del aviso ámbar a propósito:
          ese son boletas que el vendedor todavía no puede vender, y eso corre
          más prisa que instalar nada. La tarjeta se decide sola y no se pinta
          si ya está instalada o si alguien dijo «Ahora no» este mes. */}
      <InstallPrompt />

      <LotteryResultsSection audience="seller" ticketBasePath="/seller/tickets" />

      {/*
        UNA sola rejilla para las siete piezas, y dos ordenes distintos.

        TELEFONO: una columna, y el orden lo fijan las clases `order-*`. Los
        accesos rapidos suben al primer puesto porque son acciones, no lectura:
        quien entra desde el telefono viene a vender o a cobrar.

        ESCRITORIO: dos columnas. Los dos `contents` son la clave —el mismo
        recurso de D-110—: en el telefono el envoltorio desaparece y sus dos
        tarjetas quedan sueltas entre las demas, de modo que `order` puede
        colocarlas donde haga falta; a partir de `lg` vuelve a existir y forma
        una columna, que es lo que permite que «Mis boletas» y «Tendencia» se
        apilen a la izquierda mientras «Actividad reciente» y «Accesos rapidos»
        se apilan a la derecha, cada una con su altura natural. Con una rejilla
        normal, las cuatro compartirian fila y la mas corta se estiraria.
      */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <SellerKpis
          className="order-2 lg:order-none lg:col-span-2"
          collected={activity.collected}
          comparison={comparePeriods(activity.collected, activity.previousCollected)}
          periodDays={rangeLength(range)}
          pending={breakdown.pending}
          ticketsToCollect={totals.ticketsUnpaid + totals.ticketsPartial}
          collectionPercentage={percentageOf(totals.totalCollected, totals.totalSold)}
          ticketsPaid={totals.ticketsPaid}
          ticketsAssigned={totals.ticketsAssigned}
          earningPerTicket={earningPerTicket}
          ticketPrice={comisiones.raffle?.ticketPrice ?? null}
          earned={hasEarnings ? commission.earned : 0}
          teamEarned={commission?.teamEarned ?? 0}
          nextTier={nextTier}
        />

        <FinancialSummaryCard
          className="order-3 lg:order-none"
          breakdown={breakdown}
          detailed={detailed}
        />

        <CollectionStatusCard
          className="order-4 lg:order-none"
          counts={{
            unpaid: totals.ticketsUnpaid,
            partial: totals.ticketsPartial,
            paid: totals.ticketsPaid,
          }}
          breakdown={breakdown}
          detailed={detailed}
        />

        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <TicketsOverviewCard className="order-5 lg:order-none" totals={totals} />
          <CollectionTrendCard
            className="order-6 lg:order-none"
            points={activity.trend}
            rangeLabel={formatDateRangeEs(range.from, range.to)}
            collected={activity.collected}
          />
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <RecentActivityCard
            className="order-7 lg:order-none"
            payments={dashboard.recentPayments}
          />
          <QuickActionsCard className="order-1 lg:order-none" />
        </div>
      </div>
    </div>
  )
}
