import { ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { tourTarget } from '@/features/tour/tours'
import { TICKET_PAYMENT_STATUS_PLURAL_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'

import { TONE_TEXT, type MoneyTone } from '../tones'

type TicketsOverviewCardProps = {
  totals: {
    ticketsTotal: number
    ticketsAvailable: number
    ticketsAssigned: number
    ticketsUnpaid: number
    ticketsPartial: number
    ticketsPaid: number
  }
  className?: string
}

/**
 * «Mis boletas»: las seis cifras del inventario en una sola tarjeta (D-112).
 *
 * Antes eran cinco tarjetas sueltas que ocupaban una fila entera para decir
 * seis numeros. Aqui van juntas y cada una es un enlace a la lista ya filtrada.
 *
 * Las cifras son una FOTO DEL ESTADO ACTUAL y no dependen del periodo elegido
 * arriba: cuantas boletas tienes hoy no es una pregunta sobre la semana pasada
 * (encargo, seccion «Metricas de inventario»).
 *
 * «Pendientes de aprobación» ya no esta aqui —lo pidio el encargo— pero el
 * estado sigue existiendo: cuando hay boletas esperando, el panel lo dice
 * arriba con un aviso, que es donde se puede hacer algo al respecto.
 */
export function TicketsOverviewCard({ totals, className }: TicketsOverviewCardProps) {
  const items: { label: string; value: number; href: string; tone?: MoneyTone }[] = [
    { label: 'Total', value: totals.ticketsTotal, href: '/seller/tickets' },
    {
      label: 'Disponibles',
      value: totals.ticketsAvailable,
      href: '/seller/tickets?inventoryStatus=available',
    },
    {
      label: 'Vendidas',
      value: totals.ticketsAssigned,
      href: '/seller/tickets?inventoryStatus=assigned',
    },
    {
      label: TICKET_PAYMENT_STATUS_PLURAL_LABELS.unpaid,
      value: totals.ticketsUnpaid,
      href: '/seller/tickets?inventoryStatus=assigned&paymentStatus=unpaid',
      tone: 'unpaid',
    },
    {
      label: TICKET_PAYMENT_STATUS_PLURAL_LABELS.partial,
      value: totals.ticketsPartial,
      href: '/seller/tickets?inventoryStatus=assigned&paymentStatus=partial',
      tone: 'partial',
    },
    {
      label: TICKET_PAYMENT_STATUS_PLURAL_LABELS.paid,
      value: totals.ticketsPaid,
      href: '/seller/tickets?inventoryStatus=assigned&paymentStatus=paid',
      tone: 'paid',
    },
  ]

  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          <h2>Mis boletas</h2>
        </CardTitle>
        <Link
          href="/seller/tickets"
          className="text-primary inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline"
        >
          Ver mis boletas
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      </CardHeader>
      {/* Las seis en fila solo si la TARJETA da para ello (@md = 448 px). Con
          `sm:` —que mira la ventana— en escritorio quedaban seis columnas de
          43 px dentro de una tarjeta de media pantalla, y «Disponibles» no
          cabia. Por debajo de eso, 3 x 2, que se lee igual de bien. */}
      <CardContent className="@container/tickets">
        <div
          {...tourTarget('metrics-inventory')}
          className="grid grid-cols-3 gap-2 @min-[400px]/tickets:grid-cols-6"
        >
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="hover:bg-muted focus-visible:ring-ring -m-1 min-w-0 rounded-lg p-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              {/* En seis columnas la celda mide 60-65 px y «Disponibles» son 62
                  a 12 px; un punto menos lo deja en 57 y ya no se corta. */}
              <span className="text-muted-foreground block truncate text-xs @min-[400px]/tickets:text-[0.6875rem]">
                {item.label}
              </span>
              <span
                className={cn(
                  'block text-2xl font-semibold tabular-nums',
                  item.tone ? TONE_TEXT[item.tone] : undefined,
                )}
              >
                {item.value}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
