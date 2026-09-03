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
 * llega desde un enlace viejo necesita saber que lo que ve se puede pedir. A
 * 375 px o menos la palabra pasa a `sr-only` y queda un punto (D-166), pero
 * sigue estando: lo que se retira es el pixel, no el significado.
 *
 * POR QUE EL PUNTO NO PARPADEA (D-166). Se evaluo una animacion tenue de
 * `opacity` y `scale`, como pedia el encargo, y se descarto por tres razones
 * medibles, no por gusto:
 *
 *   1. Son hasta CINCUENTA puntos por pagina. Una animacion infinita promueve
 *      cada uno a su propia capa de composicion y mantiene al compositor
 *      trabajando mientras la pagina este abierta, tambien cuando nadie la
 *      mira. Esto se abre desde un enlace de WhatsApp, en un telefono de gama
 *      media y con datos: la prioridad que fijo el dueno es, por ese orden,
 *      rendimiento, carga, fluidez del scroll y gama baja — y la estetica la
 *      ultima.
 *   2. Cincuenta puntos latiendo a la vez no comunican «disponible»: comunican
 *      «tienes cincuenta avisos pendientes», que es exactamente lo que el
 *      encargo pedia evitar.
 *   3. El aviso ya esta dado por el color, por el borde violeta de la tarjeta y
 *      por el boton «Solicitar». La animacion no anadia informacion.
 *
 * Lo que si se conserva es un anillo ESTATICO y muy tenue, que se pinta una vez
 * con el resto de la tarjeta y no cuesta nada al desplazarse.
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
    <li className="border-primary/45 bg-primary/[0.07] hover:border-primary/70 hover:bg-primary/[0.12] relative flex flex-col gap-1.5 rounded-xl border p-3 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.08)] transition-colors">
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
        {/*
          UNA SOLA INSIGNIA CON DOS FORMAS (D-166), no dos elementos.

          Por encima de 375 px es la de siempre, un poco mas compacta. A 375 px
          o menos se convierte en un PUNTO de 8 px en la esquina superior
          derecha: se sale del flujo, asi que la cifra recupera la fila entera y
          deja de partirse en dos lineas — que es justo lo que se venia a ganar,
          sin encoger el numero.

          EL TEXTO NO DESAPARECE, SE VUELVE `sr-only`. Un punto de color es
          color a secas, y esta aplicacion no fia un significado solo al color
          (CLAUDE.md 27): quien escucha la pantalla sigue oyendo «Disponible».
          Escribir dos elementos —insignia y punto— habria dejado la palabra dos
          veces en el HTML y en el arbol de accesibilidad.

          EL VERDE ES EL MISMO: `variant="secondary"` lee `--secondary`, el
          unico verde del tema (`globals.css`). No se introduce otro, ni
          siquiera en el anillo, que es `ring-secondary/20`.

          POR QUE `max-[376px]` Y NO `max-[375px]`. Tailwind v4 traduce `max-*`
          a `@media not (min-width: N)`, que es «menor que N» y **deja fuera** el
          propio N: con 375 escrito, un telefono de exactamente 375 px —un
          iPhone SE o un 8— se quedaba con la insignia larga, que es el aparato
          para el que se hizo esto. Comprobado sobre la CSS servida.

          NO HAY ANIMACION, y es una decision: ver el comentario del final.
        */}
        <Badge
          variant="secondary"
          className="ms-auto px-1.5 py-px text-[0.6875rem] leading-[1.3] max-[376px]:absolute max-[376px]:end-2.5 max-[376px]:top-2.5 max-[376px]:ring-secondary/20 max-[376px]:size-2 max-[376px]:p-0 max-[376px]:ring-2"
        >
          <span className="max-[376px]:sr-only">Disponible</span>
        </Badge>
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
