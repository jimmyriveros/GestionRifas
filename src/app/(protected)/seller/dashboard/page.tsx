import { AlertTriangleIcon } from 'lucide-react'

import { PageHeader } from '@/components/data/PageHeader'
import { Notice } from '@/components/feedback/Notice'
import { InstallPrompt } from '@/features/pwa/components/InstallPrompt'
import { buildCollectionBreakdown } from '@/features/dashboard/collection-breakdown'
import { CollectionStateCard } from '@/features/dashboard/components/CollectionStateCard'
import { CollectionTrendCard } from '@/features/dashboard/components/CollectionTrendCard'
import { QuickActionsCard } from '@/features/dashboard/components/QuickActionsCard'
import { RecentActivityCard } from '@/features/dashboard/components/RecentActivityCard'
import { SellerEarningsCard } from '@/features/dashboard/components/SellerEarningsCard'
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
import { SellerCatalogCard } from '@/features/catalog/components/SellerCatalogCard'
import { catalogPublicUrl, getCatalogSettings, isCatalogLive } from '@/features/catalog/queries'
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
 * Panel del vendedor (D-112, recompuesto en D-175 y en D-180).
 *
 * CUATRO NIVELES, Y SE VEN SIN LEER UN SOLO TITULO.
 *
 *   NIVEL 0  lo que se hace nada mas entrar: repartir el catalogo y mirar la
 *            loteria. Son dos tarjetas pequeñas, en la misma fila desde `lg`.
 *   NIVEL 1  «Estado de cobro», a ancho completo. Es la respuesta a «¿como
 *            voy?», y su peso viene del sitio y del tamaño, no de mas adorno.
 *   NIVEL 2  lo que hay: «Mis boletas» y la ganancia por boleta.
 *   NIVEL 3  lo que ya paso: lo recaudado en el periodo con su tendencia, los
 *            ultimos abonos, el ofrecimiento de instalar y los accesos rapidos.
 *
 * POR QUE EL NIVEL 0 EXISTE (D-180). Las dos primeras cosas que hace un
 * vendedor al abrir el panel son mandar su enlace y mirar que salio anoche, y
 * las dos estaban en mitad de la pagina: el catalogo entre el dinero y las
 * loterias, y el recuadro de loterias a ancho completo con dos tarjetas
 * grandes. Ahora abren la pantalla, **y ninguna de las dos crecio**: el
 * catalogo perdio la direccion escrita —que nadie teclea— y el recuadro se
 * quedo en dos filas, con lo demas detras de «Ver detalle».
 *
 * MISMO ORDEN EN LOS DOS SITIOS. Hasta D-175 el telefono reordenaba con clases
 * `order-*` para subir los accesos rapidos; ya no. Con el nivel 0 arriba, el
 * orden del documento sirve igual en un telefono y en un escritorio, y un solo
 * orden es ademas el unico que un lector de pantalla puede seguir.
 *
 * QUE CIFRA MIRA QUE. El periodo manda sobre lo que PASO —el dinero recaudado y
 * su tendencia dia a dia—; el inventario y la cobranza son una foto de HOY y no
 * se mueven al cambiarlo. Es la separacion que pidio el encargo, y la unica
 * posible: la base de datos guarda el estado actual de cada boleta, no el que
 * tenia hace siete dias. Por eso su selector vive DENTRO de «Recaudado» y ya no
 * en el encabezado de la pantalla: alli parecia gobernarlo todo.
 *
 * TODO SE DIBUJA EN EL SERVIDOR. Las consultas van dentro del mismo
 * `Promise.all` —incluido el recuento de boletas disponibles por rifa, que sale
 * de la lectura que ya se hacia—, de modo que la pantalla sigue costando UNA
 * espera y no ocho; y los graficos son SVG sin JavaScript, asi que no hay
 * momento en el que se vean ceros mientras llegan los datos reales.
 *
 * LO QUE SI SALIO DE ESA ESPERA es el recuadro de loterias (D-155): entra por
 * `LotteryResultsSection`, en su propio limite de Suspense, para que una lectura
 * lenta suya no retrase estas siete piezas. Subirlo arriba no lo cambia: el
 * hueco viaja en el armazon y el recuadro llega despues, por el mismo flujo.
 */
export default async function SellerDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const [membership, params] = await Promise.all([requireRole(['seller']), searchParams])

  const rangeKey = parseDashboardRange(single(params.range))
  const range = resolveDashboardRange(rangeKey, todayBogota())

  const [dashboard, comisiones, firstTierRate, own, partialTotals, activity, catalog] =
    await Promise.all([
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
      // Su enlace publico (BR-K12). Entra en la MISMA espera que las demas: es
      // una fila por indice unico y no justifica una ida y vuelta aparte.
      getCatalogSettings(membership.profileId),
    ])

  const { totals, availableByRaffle } = dashboard

  // Las boletas que el catalogo de verdad publica: las disponibles DE LA RIFA
  // PUBLICADA (BR-K08). Sale de la misma lectura que el resto del inventario,
  // sin una consulta mas, y no se toma `totals.ticketsAvailable` porque ese
  // suma todas las rifas y diria una cifra distinta de la que el vendedor lee
  // en su propio catalogo.
  const catalogAvailable = catalog?.raffleId ? (availableByRaffle[catalog.raffleId] ?? 0) : null

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

  // `partialTotals` es `null` cuando habia demasiadas boletas abonadas para
  // leerlas una a una (I-011). Se pasa tal cual: el reparto por estado de pago
  // decide solo si puede sostenerse, y si no, la seccion se queda con los
  // totales (D-172).
  const breakdown = buildCollectionBreakdown(totals, partialTotals)

  // Las dos consultas son dos fotos distintas, asi que pueden no cuadrar si
  // alguien registra un abono entre ellas. La pantalla ya lo resuelve sola —no
  // pinta lo que no puede demostrar—, pero si pasa a menudo hay algo que mirar,
  // y en el servidor eso se dice como en el resto del proyecto.
  if (breakdown.inconsistent) {
    console.error('buildCollectionBreakdown: el detalle por estado de pago no cuadra', {
      profileId: membership.profileId,
      totals,
      partialTotals,
    })
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader title={`Hola, ${membership.fullName}`} description="Resumen de tu actividad" />

      {/* No es una tarjeta de metrica, es un aviso: son boletas que el vendedor
          todavia NO puede vender y por eso se dice arriba, con lo que hay que
          hacer, en vez de como una cifra mas de inventario. */}
      {totals.ticketsPendingApproval > 0 ? (
        <Notice tone="warning" icon={<AlertTriangleIcon />}>
          Tienes {totals.ticketsPendingApproval} boleta(s) esperando la aprobación de tu
          administrador. Todavía no puedes venderlas.
        </Notice>
      ) : null}

      {/*
        UNA sola rejilla para todo el panel, y UN SOLO ORDEN (D-180).

        Ya no hay clases `order-*`: el orden del documento es el que se ve en el
        telefono y en el escritorio. Se podia hacer porque el nivel 0 —catalogo
        y loterias— pone arriba lo que un vendedor viene a hacer, que era lo que
        el telefono conseguia antes subiendo los accesos rapidos. Un solo orden
        es ademas el unico que puede seguir quien escucha la pantalla.

        ESCRITORIO: doce columnas desde `lg`, y cada region ocupa las que le
        toca por importancia. `items-start` deja a cada tarjeta su altura: en
        una fila de dos, estirar la corta hasta la larga solo produce un hueco.

        Los anchos no son decorativos, se midieron. A 1360 el contenido mide
        1104 px, asi que 7 columnas son 634 y 5 son 446. «Estado de cobro»
        necesita 688 px de tarjeta para poner sus cuatro cifras en fila, y por
        eso ocupa las doce. El catalogo va a 7 porque sus tres botones caben en
        linea desde 448 px de contenido —a 5 columnas se quedarian en 398 y
        tendrian que apilar icono y texto—; las loterias, a 5, porque en su
        forma compacta son dos filas de texto y no necesitan mas. «Mis boletas»
        necesita 448 y le sobran con 634.

        TABLETA: a 768 el contenido mide 664 px, asi que una columna de seis
        mide 320 y una de siete, 377. El catalogo y las loterias conservan ahi
        el 7/5 —el catalogo apila icono y texto en sus botones, que es
        exactamente para lo que existe esa forma—, y el inventario y la ganancia
        van a seis y seis. La tendencia y los ultimos abonos se quedan a lo
        ancho: un grafico con sus fechas no cabe en media tableta. Una tableta
        no es un escritorio encogido ni un telefono estirado.

        TELEFONO: una columna, en el orden en que estan escritas.
      */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start md:gap-6">
        {/* NIVEL 0 — lo que se hace nada mas entrar (D-180).

            El catalogo va PRIMERO en el documento y a la izquierda en la fila,
            porque es lo unico de los dos que se toca: la loteria se lee.

            Se pinta SIEMPRE: cuando el catalogo no esta publicado dice
            «Inactivo» y explica que falta, en vez de desaparecer sin que el
            vendedor sepa que la funcion existe. Lo que desaparece son los
            botones. */}
        <SellerCatalogCard
          className="md:col-span-12 lg:col-span-7"
          publicUrl={catalog?.slug ? catalogPublicUrl(catalog.slug) : null}
          raffleName={catalog?.raffleName ?? null}
          isLive={isCatalogLive(catalog)}
          availableTickets={catalogAvailable}
        />
        <LotteryResultsSection
          className="md:col-span-12 lg:col-span-5"
          audience="seller"
          ticketBasePath="/seller/tickets"
          variant="compact"
        />

        {/* NIVEL 1. «Estado de cobro» es el resumen canonico del dinero desde
            D-171: fundio «Resumen financiero» y «Cobranza», y desde D-175
            absorbe tambien lo que decian «Por cobrar» y «Cobranza» arriba. Es
            la unica region a ancho completo del nivel superior. */}
        <CollectionStateCard
          className="md:col-span-12"
          inventory={{
            available: totals.ticketsAvailable,
            sold: totals.ticketsAssigned,
          }}
          counts={{
            unpaid: totals.ticketsUnpaid,
            partial: totals.ticketsPartial,
            paid: totals.ticketsPaid,
          }}
          breakdown={breakdown}
        />

        {/* NIVEL 2 — que tengo y cuanto me deja. Las dos hablan del negocio del
            vendedor: lo que le queda por vender y lo que gana vendiendolo. */}
        <TicketsOverviewCard className="md:col-span-6 lg:col-span-7" totals={totals} />
        <SellerEarningsCard
          className="md:col-span-6 lg:col-span-5"
          earningPerTicket={earningPerTicket}
          ticketPrice={comisiones.raffle?.ticketPrice ?? null}
          earned={hasEarnings ? commission.earned : 0}
          teamEarned={commission?.teamEarned ?? 0}
          nextTier={nextTier}
        />

        {/* NIVEL 3 — lo que ya paso. */}
        <CollectionTrendCard
          className="md:col-span-12 lg:col-span-7"
          rangeKey={rangeKey}
          rangeLabel={formatDateRangeEs(range.from, range.to)}
          points={activity.trend}
          collected={activity.collected}
          comparison={comparePeriods(activity.collected, activity.previousCollected)}
          periodDays={rangeLength(range)}
        />
        <RecentActivityCard
          className="md:col-span-12 lg:col-span-5"
          payments={dashboard.recentPayments}
        />

        {/* Sigue estando y sigue decidiendo sola si aparece —no se pinta si ya
            esta instalada o si alguien dijo «Ahora no» este mes—, pero es
            contenido de apoyo: D-123 la subio arriba porque al final de una
            pagina de dos pantallas y media nadie la veia nunca, y esta mide
            bastante menos. */}
        <InstallPrompt className="md:col-span-12" />

        {/* Los accesos rapidos CIERRAN el panel (D-180). No desaparecen ni
            pierden ningun destino: cada uno lleva al mismo sitio de siempre.
            Bajan porque las cuatro cosas que ofrecen —vender, crear un cliente,
            registrar un abono, ver reportes— estan tambien en el menu, que en
            el telefono vive fijo en la barra de abajo; y porque lo que se venia
            a mirar es el catalogo, la loteria y el dinero. */}
        <QuickActionsCard className="md:col-span-12" />
      </div>
    </div>
  )
}
