import { Button } from '@/components/ui/button'

import { catalogContactMessage, whatsappUrl } from '../whatsapp'
import { WhatsappIcon } from './WhatsappIcon'

/**
 * El encabezado fijo del catalogo publico (BR-K01, D-163).
 *
 * QUIEN ES Y COMO ESCRIBIRLE, Y NADA MAS. Antes aqui vivian tambien el titulo y
 * el buscador; con el rediseño esos bajan al hero y este se queda con lo unico
 * que tiene que seguir a la vista mientras se recorren cincuenta boletas: de
 * quien es el catalogo y el boton para escribirle. En un telefono eso son 56 px
 * en vez de los 150 de antes.
 *
 * `sticky` Y NO `fixed`. `sticky` conserva el hueco del elemento en el flujo,
 * asi que el contenido NO puede quedar debajo: no hay que compensar con un
 * relleno superior que habria que corregir cada vez que el encabezado cambie de
 * alto. Y no hay un solo escuchador de scroll: lo resuelve el navegador.
 *
 * ES EL UNICO `<header>` DE LA PAGINA. El hero es un `<section>`: dos elementos
 * `header` dejarian ambiguo cual es el encabezado de la pagina, para un lector
 * de pantalla y para quien lea el codigo.
 *
 * EL BOTON NO ES UN ICONO SOLO. Un icono desnudo obliga a adivinar (D-161), asi
 * que lleva su palabra al lado; lo que se abrevia bajo `sm` es la parte que no
 * cabe —«por WhatsApp»—, que sigue estando para quien escucha la pantalla, no
 * se recorta para todo el mundo (D-114).
 */

/**
 * Iniciales del vendedor para el circulo.
 *
 * Se escribe aqui, y no se importa, a proposito: hay dos funciones identicas en
 * `UserMenu` y en `RecentActivityCard`, las dos del portal interno, y este
 * encargo es un rediseño visual del catalogo que no toca el portal. Unificar las
 * tres es un cambio propio, con sus propias pruebas.
 */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

export function CatalogHeader({
  sellerName,
  sellerShortName,
  whatsappNumber,
}: {
  sellerName: string
  sellerShortName: string
  whatsappNumber: string
}) {
  const contacto = whatsappUrl(whatsappNumber, catalogContactMessage(sellerShortName))

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[oklch(0.145_0.035_292_/_0.82)] pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2.5">
        <span
          className="ring-primary/40 flex size-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(140deg,oklch(0.6_0.24_298),oklch(0.42_0.2_285))] text-xs font-semibold text-white ring-1"
          aria-hidden
        >
          {initialsFor(sellerName)}
        </span>

        {/*
          El nombre es el PRIMER `<p>` del encabezado y se recorta con puntos
          suspensivos: «Maria Fernanda del Sagrado Corazon Restrepo Villalobos»
          no puede empujar el boton fuera de la pantalla. `min-w-0` es lo que se
          lo permite: sin el, un hijo flexible no baja de su ancho de contenido.
        */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight font-semibold">{sellerName}</p>
          <p className="text-muted-foreground truncate text-xs leading-tight">Vendedor oficial</p>
        </div>

        <Button
          asChild
          size="sm"
          variant="outline"
          className="h-10 shrink-0 border-white/15 bg-white/5 hover:bg-white/10"
        >
          <a href={contacto} target="_blank" rel="noopener noreferrer">
            <WhatsappIcon className="size-4 text-[#25d366]" />
            {/*
              Un solo hijo del boton, no dos: `Button` es `flex gap-2` y dos nodos
              sueltos habrian dejado un hueco de 8 px en mitad de la frase. Lo que
              se abrevia bajo `sm` es «por WhatsApp», que sigue contando para el
              nombre accesible (D-114).
            */}
            <span>
              Escríbenos<span className="sr-only sm:not-sr-only"> por WhatsApp</span>
            </span>
          </a>
        </Button>
      </div>
    </header>
  )
}
