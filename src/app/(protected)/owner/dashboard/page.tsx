import { AlertTriangleIcon } from 'lucide-react'
import Link from 'next/link'

import { CollectionSummaryCard } from '@/components/data/CollectionSummaryCard'
import { MetricCard } from '@/components/data/MetricCard'
import { PageHeader } from '@/components/data/PageHeader'
import { Notice } from '@/components/feedback/Notice'
import { InstallPrompt } from '@/features/pwa/components/InstallPrompt'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { buildCollectionBreakdown } from '@/features/dashboard/collection-breakdown'
import { getAdminDashboard } from '@/features/dashboard/queries'
import { getPartialTicketTotals } from '@/features/dashboard/seller-queries'
import { LotteryResultsSection } from '@/features/lottery/components/LotteryResultsSection'
import { tourTarget } from '@/features/tour/tours'
import { requireStaff } from '@/lib/auth/guards'
import { ROLE_LABELS } from '@/lib/constants'
import { formatDateEs } from '@/lib/dates'
import { formatCOP } from '@/lib/money'

/**
 * Panel del dueno y del administrador.
 *
 * El recuadro de loterias NO se espera aqui (D-155): entra por
 * `LotteryResultsSection`, que lo aisla en su propio limite de Suspense. Todo lo
 * demas de esta pantalla se envia en cuanto responde `getAdminDashboard`.
 */
export default async function OwnerDashboardPage() {
  const membership = await requireStaff()

  // El reparto del dinero por estado de pago sale de la MISMA funcion que usa
  // el panel del vendedor, y sin tocarla: no filtra por vendedor —lee
  // `v_ticket_balances`, que es `security_invoker`— asi que la politica
  // `tickets_select` decide el alcance. Un vendedor obtiene lo suyo; el
  // personal, toda la organizacion. Cero consultas nuevas y cero migraciones.
  const [dashboard, partialTotals] = await Promise.all([
    getAdminDashboard(),
    getPartialTicketTotals(),
  ])
  const { totals } = dashboard

  // `null` cuando habia demasiadas boletas abonadas para leerlas una a una
  // (I-011). Se pasa tal cual: el reparto decide solo si puede sostenerse, y si
  // no, la tarjeta se queda con los totales y los recuentos (D-172).
  const breakdown = buildCollectionBreakdown(totals, partialTotals)

  // LOS VENDEDORES QUE APARECEN, Y EN QUE ORDEN (D-183).
  //
  // `listSellersWithTotals` devuelve la plantilla ENTERA y sin ordenar por
  // nada util, y el panel los pintaba todos: con treinta vendedores, treinta
  // filas, y un «Ver todos» que no llevaba a nada que no estuviera ya delante.
  //
  // Se ordena por SALDO PENDIENTE, de mayor a menor, porque es la pregunta que
  // se hace quien administra la rifa —quien va atrasado— y porque es dinero en
  // pesos, no una proporcion que un vendedor con una sola boleta sin pagar
  // pondria arriba con un 0 %.
  //
  // SOBRE UNA COPIA: `sort` ordena en el sitio, y ese array sale de una lectura
  // memoizada por peticion que comparten `/owner/sellers`, los reportes y el
  // equipo del vendedor. Ordenarlo aqui les cambiaria el orden a los cuatro.
  const VENDEDORES_EN_EL_PANEL = 5
  const vendedoresDelPanel = [...dashboard.sellers]
    .sort((a, b) => b.pendingAmount - a.pendingAmount)
    .slice(0, VENDEDORES_EN_EL_PANEL)
  const hayMasVendedores = dashboard.sellers.length > VENDEDORES_EN_EL_PANEL

  if (breakdown.inconsistent) {
    console.error('buildCollectionBreakdown: el detalle por estado de pago no cuadra', {
      organizationId: membership.organizationId,
      totals,
      partialTotals,
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hola, ${membership.fullName}`}
        description={membership.organizationName}
        actions={<Badge variant="secondary">{ROLE_LABELS[membership.role]}</Badge>}
      />

      {totals.ticketsPendingApproval > 0 ? (
        <Notice
          tone="warning"
          icon={<AlertTriangleIcon />}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/owner/tickets?inventoryStatus=pending_approval">Revisar</Link>
            </Button>
          }
        >
          Hay {totals.ticketsPendingApproval} boleta(s) pendientes de aprobación.
        </Notice>
      ) : null}

      {/* Arriba, no al final (D-123). Después del aviso ámbar: aprobar boletas
          corre más prisa que instalar nada. */}
      <InstallPrompt />

      {/* NIVEL 1, y por eso va ANTES del recuadro de loterias (D-182). Estaba
          cuarto, en y = 519 medidos, detras de un recuadro de 252 px que en una
          organizacion sin sorteos programados solo dice que no hay resultados.
          Quien administra la rifa entra a ver el dinero; la loteria es contexto
          y se lee despues. Es la misma correccion que D-175 hizo en el panel
          del vendedor, con una diferencia: alli hay un nivel 0 con el catalogo
          —algo que se HACE— y aqui no lo hay, asi que nada precede al dinero. */}
      <CollectionSummaryCard
        totalSold={totals.totalSold}
        totalCollected={totals.totalCollected}
        pendingAmount={totals.pendingAmount}
        pendingTicketsCount={totals.ticketsUnpaid + totals.ticketsPartial}
        counts={{
          unpaid: totals.ticketsUnpaid,
          partial: totals.ticketsPartial,
          paid: totals.ticketsPaid,
        }}
        breakdown={breakdown}
      />

      {/* SIGUE EN `full`, y se evaluo pasarlo a `compact` como el del vendedor.
          No se hizo, por tres razones medidas: (1) en una organizacion sin
          sorteos programados las dos formas pintan el MISMO estado vacio, asi
          que el ahorro real fue de 32 px, no de los ~150 que se esperaban;
          (2) quien verifica un resultado y paga un premio es justamente el
          personal, que es para quien esta pensado el numero grande con su
          procedencia a la vista; y (3) el vendedor ya usa `compact`, asi que
          cambiar este dejaria la forma `full` sin un solo consumidor. D-180
          decidio que este portal la conserva, y no hay evidencia para
          reabrirlo. Lo que si sobra son los ~230 px del estado vacio, y eso es
          otra decision. */}
      <LotteryResultsSection audience="staff" ticketBasePath="/owner/tickets" />

      {/*
        NIVEL 2, en dos columnas desde `lg` (D-183).

        Hasta ahora estas dos regiones eran dos bloques a ancho completo, uno
        debajo del otro, y a 1600 la pagina medía EXACTAMENTE lo mismo que a
        1360: los 216 px de mas no los usaba nadie.

        POR QUE 7/5, y por que solo desde `lg`. Medido: a 1360 el contenido son
        1104 px, asi que 7 columnas dan 634 y 5 dan 446. La tabla de vendedores
        pide **471 px** de ancho minimo —medido con `width: min-content`; sus
        seis columnas son Vendedor 246, Boletas 146, Vendidas 172, Vendido 168,
        Recaudado 202 y Saldo 168— asi que en 634 entra con holgura y no
        necesita desplazarse. A 1024, el primer escalon de `lg`, son 527: sigue
        entrando. A 768 serian 377, por debajo de su minimo, y la tabla entraria
        en desplazamiento lateral sin ninguna necesidad; por eso ahi se apilan.
      */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <section {...tourTarget('seller-summary')} className="min-w-0 space-y-3 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-heading-h4">Resumen por vendedor</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/owner/sellers">Ver todos</Link>
            </Button>
          </div>

          {/* CUANDO NO CABEN TODOS, SE DICE. La tabla enseña como mucho cinco
              filas, y sin esta linea las cinco se leerian como la plantilla
              entera. Se escribe solo cuando de verdad sobran vendedores: con
              tres, decir «los 3 con mas saldo pendiente» seria ruido. */}
          {hayMasVendedores ? (
            <p className="text-muted-foreground text-body-small">
              Los {VENDEDORES_EN_EL_PANEL} con más saldo pendiente, de {dashboard.sellers.length}.
            </p>
          ) : null}
          {dashboard.sellers.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no hay vendedores.{' '}
              <Link href="/owner/sellers" className="underline">
                Invita al primero
              </Link>
              .
            </p>
          ) : (
            <div className="w-full overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Boletas</TableHead>
                    <TableHead className="text-right">Vendidas</TableHead>
                    <TableHead className="text-right">Vendido</TableHead>
                    <TableHead className="text-right">Recaudado</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendedoresDelPanel.map((seller) => (
                    <TableRow key={seller.profileId}>
                      <TableCell>
                        <Link
                          href={`/owner/sellers/${seller.profileId}`}
                          className="font-medium hover:underline"
                        >
                          {seller.fullName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {seller.ticketsTotal}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {seller.ticketsAssigned}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCOP(seller.totalSold)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCOP(seller.totalCollected)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCOP(seller.pendingAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="min-w-0 lg:col-span-5">
          <h2 className="text-heading-h4 mb-3">Inventario</h2>
          {/* CUATRO cifras, no cinco. «Pendientes de aprobación» se fue: el
              aviso ambar de arriba ya las cuenta Y ofrece «Revisar», asi que
              aqui se contaban dos veces (misma regla que D-172 en el panel del
              vendedor). Y «Total de boletas» pasa a llamarse «Registradas»,
              porque cuenta ademas borradores, pendientes y anuladas: decia 30
              al lado de 17 y 8, y esas cinco no se explicaban en ninguna parte.

              Se quedan en DOS columnas tambien en escritorio: a 1360 esta
              region mide 446 px —398 de contenido—, y cuatro columnas ahi
              dejarian 87 px por tarjeta, donde «Vendedores activos» no cabe. */}
          <div {...tourTarget('metrics-inventory')} className="grid grid-cols-2 gap-4">
            <MetricCard label="Vendedores activos" value={dashboard.activeSellers} />
            <MetricCard label="Registradas" value={totals.ticketsTotal} />
            <MetricCard label="Disponibles" value={totals.ticketsAvailable} />
            <MetricCard label="Asignadas" value={totals.ticketsAssigned} />
          </div>
        </section>
      </div>

      {/* «Boletas creadas recientemente» se retiro: listaba las cinco ultimas
          con su hora, que en la practica es lo que la persona acaba de importar
          o crear en lote —lo sabe, porque viene de hacerlo—. Es la misma razon
          por la que D-112 dejo UNA lista en el panel del vendedor en vez de
          tres: repetir aqui lo que ya tiene su pantalla convierte el panel en un
          indice. «Ver todas» sigue estando en el menu, en «Boletas». */}
      <div className="grid gap-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-heading-h4">Pagos recientes</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/owner/payments">Ver todos</Link>
            </Button>
          </div>
          {dashboard.recentPayments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no se ha registrado ningún abono.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {dashboard.recentPayments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/owner/clients/${payment.clientId}`}
                      className="font-medium hover:underline"
                    >
                      {payment.clientName}
                    </Link>
                    <p className="text-muted-foreground truncate text-xs">
                      {payment.sellerName ?? 'Otro vendedor'} · {formatDateEs(payment.paymentDate)}
                    </p>
                  </div>
                  <span
                    className={
                      payment.isActive
                        ? 'shrink-0 text-sm font-medium tabular-nums'
                        : 'text-muted-foreground shrink-0 text-sm tabular-nums line-through'
                    }
                    // El texto es lo que informa, no el tachado (CLAUDE.md 27).
                    title={payment.isActive ? undefined : 'Pago anulado'}
                  >
                    {formatCOP(payment.totalAmount)}
                    {payment.isActive ? '' : ' (anulado)'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
