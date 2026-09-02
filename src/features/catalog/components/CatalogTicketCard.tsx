import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { PublicCatalogTicket } from '../queries'
import { catalogWhatsappMessage, whatsappUrl } from '../whatsapp'

/**
 * Una boleta en la reja publica (BR-K08, BR-K09).
 *
 * NO SE REUTILIZA `TicketCardList`. Esa tarjeta arrastra el cliente, el dinero,
 * el estado de pago, la seleccion multiple y un enlace al detalle del portal
 * protegido: extenderla para que ocultara seis cosas habria dejado la puerta
 * abierta a que un cambio futuro colara un dato privado en una pagina publica.
 * Aqui se pinta lo que hay —dos numeros y un booleano— y no puede pintarse otra
 * cosa, porque no llega otra cosa.
 *
 * EL NUMERO DIARIO MANDA Y EL SEMANAL ACOMPANA. Es lo que pidio el encargo, y
 * se diferencia por tamano Y por palabra: el segundo va rotulado «Semanal», el
 * termino del glosario, para que nadie tenga que adivinar cual es cual. La
 * leyenda «Diario · Semanal» de las listas internas (D-107, D-130) no encaja
 * aqui porque alli los dos numeros pesan lo mismo y aqui no.
 *
 * DISPONIBLE Y TOMADO NO SE DISTINGUEN SOLO POR EL COLOR (CLAUDE.md 27): cada
 * tarjeta lleva su palabra escrita, y la tomada ademas no tiene boton. Quien no
 * distingue el gris del blanco lee «Tomado» igual.
 *
 * LA TOMADA NO DICE QUIEN LA TIENE. No es que no se muestre: es que el dato no
 * viaja hasta aqui.
 */

/**
 * Los dos numeros y la insignia.
 *
 * `flex-wrap` + `ms-auto` NO es decoracion: a 320 px la tarjeta mide unos
 * 138 px y «0000» junto a «Disponible» no cabe en una linea. Sin el envoltorio
 * flexible, la insignia se montaba encima de la cifra y el numero —lo unico que
 * de verdad hay que leer— quedaba cortado. Asi, cuando no cabe, la insignia baja
 * a la linea siguiente y sigue alineada a la derecha; cuando cabe, se queda
 * arriba a la derecha, que es donde la pidio el encargo.
 *
 * «Semanal 5678» va en una linea propia y con `whitespace-nowrap`: partido en
 * dos lineas parecia otro dato distinto.
 */
function TicketNumbers({
  dailyNumber,
  weeklyNumber,
  badge,
}: {
  dailyNumber: string
  weeklyNumber: string
  badge: React.ReactNode
}) {
  return (
    <>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <p className="font-mono text-2xl leading-none font-semibold tabular-nums">
          <span className="sr-only">Número diario </span>
          {dailyNumber}
        </p>
        <div className="ms-auto">{badge}</div>
      </div>
      <p className="text-xs whitespace-nowrap">
        <span className="text-muted-foreground">Semanal </span>
        <span className="font-mono tabular-nums">{weeklyNumber}</span>
      </p>
    </>
  )
}

export function CatalogTicketCard({
  ticket,
  sellerShortName,
  whatsappNumber,
}: {
  ticket: PublicCatalogTicket
  sellerShortName: string
  whatsappNumber: string
}) {
  const { dailyNumber, weeklyNumber, taken } = ticket

  if (taken) {
    return (
      <li className="bg-muted/60 text-muted-foreground flex flex-col gap-1.5 rounded-lg border p-3">
        <TicketNumbers
          dailyNumber={dailyNumber}
          weeklyNumber={weeklyNumber}
          badge={<Badge variant="outline">Tomado</Badge>}
        />
      </li>
    )
  }

  const message = catalogWhatsappMessage({ sellerShortName, dailyNumber, weeklyNumber })

  return (
    <li className="bg-card flex flex-col gap-1.5 rounded-lg border p-3 shadow-xs">
      <TicketNumbers
        dailyNumber={dailyNumber}
        weeklyNumber={weeklyNumber}
        badge={<Badge variant="secondary">Disponible</Badge>}
      />
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
          Solicitar
        </a>
      </Button>
    </li>
  )
}
