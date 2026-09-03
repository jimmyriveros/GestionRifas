import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { PublicCatalogTicket } from '../queries'
import { catalogWhatsappMessage, whatsappUrl } from '../whatsapp'
import { WhatsappIcon } from './WhatsappIcon'

/**
 * Una boleta en la reja publica (BR-K08, BR-K09; D-163, D-164).
 *
 * SOLO LLEGAN BOLETAS DISPONIBLES. Desde D-164 la base filtra por
 * `inventory_status = 'available'` antes de paginar, asi que aqui no hay —ni
 * puede haber— una boleta vendida: no se pinta en gris, no se oculta con CSS,
 * no viaja. Por eso la tarjeta ya no tiene dos caminos; tenia uno para «Tomado»
 * y era codigo que hoy nadie podria alcanzar.
 *
 * NO SE REUTILIZA `TicketCardList`. Esa tarjeta arrastra el cliente, el dinero,
 * el estado de pago, la seleccion multiple y un enlace al detalle del portal
 * protegido: extenderla para que ocultara seis cosas habria dejado la puerta
 * abierta a que un cambio futuro colara un dato privado en una pagina publica.
 * Aqui se pinta lo que hay —dos numeros— y no puede pintarse otra cosa, porque
 * no llega otra cosa.
 *
 * EL NUMERO DIARIO MANDA Y EL SEMANAL ACOMPANA. Es lo que pidio el encargo, y
 * se diferencia por tamano Y por palabra: el segundo va rotulado «Semanal», el
 * termino del glosario, para que nadie tenga que adivinar cual es cual.
 *
 * «DISPONIBLE» SE SIGUE ESCRIBIENDO, aunque ya no haya con que confundirla
 * (CLAUDE.md 27): quien no distingue el verde del gris lee la palabra, y quien
 * llega desde un enlace viejo necesita saber que lo que ve se puede pedir.
 */
export function CatalogTicketCard({
  ticket,
  sellerShortName,
  whatsappNumber,
}: {
  ticket: PublicCatalogTicket
  sellerShortName: string
  whatsappNumber: string
}) {
  const { dailyNumber, weeklyNumber } = ticket
  const message = catalogWhatsappMessage({ sellerShortName, dailyNumber, weeklyNumber })

  return (
    <li className="border-primary/45 bg-primary/[0.07] hover:border-primary/70 hover:bg-primary/[0.12] flex flex-col gap-1.5 rounded-xl border p-3 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.08)] transition-colors">
      {/*
        `flex-wrap` + `ms-auto` NO es decoracion: a 320 px la tarjeta mide unos
        138 px y «0000» junto a «Disponible» no cabe en una linea. Sin el
        envoltorio flexible, la insignia se montaba encima de la cifra y el
        numero —lo unico que de verdad hay que leer— quedaba cortado.
      */}
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <p className="font-mono text-2xl leading-none font-semibold tabular-nums text-white">
          <span className="sr-only">Número diario </span>
          {dailyNumber}
        </p>
        <div className="ms-auto">
          <Badge variant="secondary">Disponible</Badge>
        </div>
      </div>

      {/* Partido en dos lineas parecia otro dato distinto. */}
      <p className="text-xs whitespace-nowrap">
        <span className="text-muted-foreground">Semanal </span>
        <span className="font-mono tabular-nums">{weeklyNumber}</span>
      </p>

      <Button asChild size="sm" className="mt-1 h-11 w-full md:h-9">
        {/*
          Un enlace normal, no una accion: abrir WhatsApp no registra una venta,
          no cambia el estado de la boleta, no crea un cliente y no reserva
          nada (BR-K09). `rel="noopener noreferrer"` porque sale del sitio.
        */}
        <a
          href={whatsappUrl(whatsappNumber, message)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Solicitar por WhatsApp la boleta ${dailyNumber} / ${weeklyNumber}`}
        >
          <WhatsappIcon className="size-4" />
          Solicitar
        </a>
      </Button>
    </li>
  )
}
