'use client'

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { LIST_ITEM_LABELS, type ListItemKind } from '@/lib/constants'

type DataTablePaginationProps = {
  /** Total de filas que cumplen el filtro, no las de esta pagina. */
  total: number
  page: number
  pageSize: number
  /**
   * Que se esta contando. Obligatorio: «1–25 de 118» no dice de que, y quien
   * lee la pantalla en un telefono no tiene el encabezado de la tabla a la
   * vista para deducirlo. Los nombres salen de `LIST_ITEM_LABELS`, no de un
   * texto suelto (D-111).
   */
  items: ListItemKind
  /**
   * Para una lista que NO ocupa la pantalla entera (I-156): el `id` del
   * elemento donde empieza. Sin esto, cambiar de pagina devuelve arriba del todo
   * —medido en la ficha del cliente: de 1.311 px a 0—, y el historial queda al
   * pie, lejos. Con esto se navega sin desplazar y despues se trae a la vista el
   * principio de la lista. Sin indicarlo, el comportamiento de siempre.
   */
  scrollTargetId?: string
}

/**
 * Paginacion de SERVIDOR: escribe `page` en la URL y deja que el RSC vuelva a
 * consultar con `range()`. Mantener el estado en la URL hace que la pagina sea
 * compartible y sobreviva a un refresco.
 *
 * UNA SOLA FILA DE CONTROLES, DOS REPARTOS (D-111). El calculo, los limites y
 * la navegacion son los mismos en las dos pantallas; lo unico que cambia es
 * como se reparte el ancho:
 *
 *   Telefono            Escritorio
 *   ─────────           ──────────
 *      1–25 de 118 boletas          1–25 de 118 boletas   [‹ Ant.][1 de 5][Sig. ›]
 *   [‹ Anterior]  1 de 5  [Sig. ›]
 *
 * En el telefono el recuento va arriba y centrado, los botones ocupan los dos
 * extremos —que es donde llega el pulgar— y el indicador se centra en lo que
 * queda entre ellos. En escritorio sobra ancho y todo cabe en una linea, como
 * siempre.
 *
 * EL INDICADOR NO ES UN BOTON y por eso no lo parece: sin borde, sin fondo y
 * sin sombra. Solo informa de donde estas.
 *
 * «PÁGINA» SE OYE AUNQUE NO SE VEA. En el telefono el espacio no da para
 * escribirla, pero «1 de 5» a secas no dice de que son ese 1 y ese 5: la
 * palabra se queda en `sr-only` bajo `md`, de modo que un lector de pantalla
 * sigue anunciando «Página 1 de 5» en las dos pantallas.
 *
 * LOS BOTONES NO DESAPARECEN AL LLEGAR AL EXTREMO, se deshabilitan. Si
 * «Anterior» se escondiera en la primera pagina, «Siguiente» se moveria de
 * sitio justo cuando el dedo va a buscarlo.
 *
 * NEUTRAL A PROPOSITO: los dos botones son `outline`. El color de acento de la
 * aplicacion esta reservado a estados y acciones primarias, y pasar de pagina
 * no es ninguna de las dos cosas.
 */
export function DataTablePagination({
  total,
  page,
  pageSize,
  items,
  scrollTargetId,
}: DataTablePaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const label = LIST_ITEM_LABELS[items]

  const previousRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  // Que boton se pulso, para devolverle el foco cuando llegue la pagina nueva.
  const pressedRef = useRef<'previous' | 'next' | null>(null)

  /*
    EL FOCO NO SE PIERDE AL CAMBIAR DE PAGINA (I-156, medido). Los botones se
    deshabilitaban mientras navegaban, y un boton que se deshabilita suelta el
    foco: quedaba en `body` y con el teclado no se podia pulsar «Siguiente» dos
    veces seguidas. Ya no se deshabilitan por la espera —se anuncia con
    `aria-busy`, igual que el control de orden (D-215)—, y si la pagina nueva
    deshabilita el pulsado —«Siguiente» en la ultima—, el foco pasa al otro.
  */
  useEffect(() => {
    const pressed = pressedRef.current
    if (pressed === null) return
    pressedRef.current = null

    const [mine, other] =
      pressed === 'next'
        ? [nextRef.current, previousRef.current]
        : [previousRef.current, nextRef.current]
    const focused = document.activeElement
    if (focused === mine || focused === document.body || focused === null) {
      if (mine && !mine.disabled) mine.focus({ preventScroll: true })
      else other?.focus({ preventScroll: true })
    }

    if (scrollTargetId) {
      const target = document.getElementById(scrollTargetId)
      // Solo si el principio de la lista quedo por encima de la pantalla: si ya
      // se ve, moverla seria un salto que nadie pidio.
      if (target && target.getBoundingClientRect().top < 0) {
        target.scrollIntoView({ block: 'start' })
      }
    }
  }, [page, scrollTargetId])

  function goTo(nextPage: number) {
    pressedRef.current = nextPage < page ? 'previous' : 'next'
    const params = new URLSearchParams(searchParams.toString())
    if (nextPage <= 1) {
      params.delete('page')
    } else {
      params.set('page', String(nextPage))
    }
    const query = params.toString()
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, {
        scroll: scrollTargetId === undefined,
      })
    })
  }

  return (
    // `pb-2` bajo `md`: el hueco que reserva el armazon para la barra inferior
    // empieza justo aqui, y sin este respiro la ultima linea de la pantalla
    // queda pegada a los botones de navegacion.
    <div className="flex flex-col items-center justify-between gap-4 pb-2 md:flex-row md:gap-3 md:pb-0">
      <p className="text-muted-foreground text-body-small" aria-live="polite">
        {total === 0
          ? 'Nada para mostrar'
          : `${from}–${to} de ${total} ${total === 1 ? label.one : label.many}`}
      </p>
      {/* De lado a lado en el telefono; a la derecha del recuento en escritorio.

          El tope de 448 px no se nota en ningun telefono —el mas ancho deja 398
          de contenido—, y evita que en una ventana estrecha de escritorio, que
          todavia esta bajo `md`, los dos botones acaben separados medio metro
          con el indicador perdido en medio. Lo centra `items-center` del padre. */}
      <div className="flex w-full max-w-md items-center justify-between gap-2 md:w-auto md:max-w-none">
        <Button
          type="button"
          variant="outline"
          size="sm"
          // 44 px de alto y algo mas de aire a los lados, solo en el telefono.
          // Las dos clases `md:` devuelven exactamente el boton de antes, y
          // `cn()` retira las del `size` que sobran, asi que ninguna depende del
          // orden en que Tailwind emita las utilidades (D-110).
          //
          // 12 px y no 16: a 320 px los dos botones y sus huecos dejan 64 px
          // para el indicador, que es lo que necesita «1 de 1024» en una sola
          // linea. Con 16 px la cifra se parte en dos justo en la pantalla mas
          // estrecha, que es donde menos se puede leer.
          className="h-11 has-[>svg]:px-3 md:h-8 md:has-[>svg]:px-2.5"
          ref={previousRef}
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          aria-busy={isPending}
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          Anterior
        </Button>
        {/* `flex-1` centra el indicador en lo que queda entre los dos botones,
            que es lo unico que se puede centrar cuando «Anterior» y «Siguiente»
            no miden lo mismo. En escritorio vuelve a ocupar lo suyo. */}
        <span className="text-body-small flex-1 text-center tabular-nums md:flex-none">
          <span className="sr-only md:not-sr-only">Página </span>
          {page} de {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 has-[>svg]:px-3 md:h-8 md:has-[>svg]:px-2.5"
          ref={nextRef}
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
          aria-busy={isPending}
        >
          Siguiente
          <ChevronRightIcon className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
