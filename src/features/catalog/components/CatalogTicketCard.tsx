import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { PublicCatalogTicket } from '../queries'
import { catalogWhatsappMessage, whatsappUrl } from '../whatsapp'
import { WhatsappIcon } from './WhatsappIcon'

/**
 * Una boleta en la reja publica (BR-K08, BR-K09; rediseñada en D-163).
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
 * distingue el gris del blanco lee «Tomado» igual. El rediseño añade una tercera
 * señal —la libre tiene borde violeta y resplandor; la tomada, ninguno— pero no
 * quita ninguna de las dos que ya estaban.
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
  dimmed = false,
}: {
  dailyNumber: string
  weeklyNumber: string
  badge: React.ReactNode
  dimmed?: boolean
}) {
  return (
    <>
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <p
          className={
            dimmed
              ? 'text-muted-foreground font-mono text-2xl leading-none font-semibold tabular-nums'
              : 'font-mono text-2xl leading-none font-semibold tabular-nums text-white'
          }
        >
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
      <li className="bg-muted/25 text-muted-foreground flex flex-col gap-1.5 rounded-xl border border-white/[0.06] p-3">
        <TicketNumbers
          dailyNumber={dailyNumber}
          weeklyNumber={weeklyNumber}
          badge={<Badge variant="outline">Tomado</Badge>}
          dimmed
        />
      </li>
    )
  }

  const message = catalogWhatsappMessage({ sellerShortName, dailyNumber, weeklyNumber })

  return (
    <li className="border-primary/45 bg-primary/[0.07] hover:border-primary/70 hover:bg-primary/[0.12] flex flex-col gap-1.5 rounded-xl border p-3 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.08)] transition-colors">
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
          <WhatsappIcon className="size-4" />
          Solicitar
        </a>
      </Button>
    </li>
  )
}
