'use client'

import { useCatalogSticky } from '../sticky'

/**
 * El encabezado fijo del catalogo publico (BR-K01, D-163, D-164).
 *
 * QUIEN ES, Y DONDE ESTAS. Dice de quien es el catalogo y, cuando el titulo del
 * hero se pierde de vista, recoge tambien el nombre de la rifa. Nada mas: el
 * boton general de WhatsApp se retiro en D-164 porque competia con los
 * «Solicitar» de cada boleta, que son los que el vendedor quiere recibir —un
 * mensaje que no nombra ninguna boleta le obliga a preguntar cual—.
 *
 * `sticky` Y NO `fixed`. `sticky` conserva el hueco del elemento en el flujo,
 * asi que el contenido NO puede quedar debajo: no hay que compensar con un
 * relleno superior que habria que corregir cada vez que el encabezado cambie de
 * alto. Y no hay un solo escuchador de scroll: lo resuelve el navegador.
 *
 * ES EL UNICO `<header>` DE LA PAGINA. El hero es un `<section>`: dos elementos
 * `header` dejarian ambiguo cual es el encabezado de la pagina.
 *
 * EL ALTO NO CAMBIA AL RECOGER EL TITULO, y no es un detalle estetico: el
 * nombre de la rifa SUSTITUYE a «Vendedor oficial» en la segunda linea en vez
 * de anadir una tercera. Si el encabezado creciera, empujaria el contenido, el
 * titulo del hero se moveria y el observador entraria en un bucle de aparecer y
 * desaparecer (ver `sticky.tsx`).
 */

/**
 * Iniciales del vendedor para el circulo.
 *
 * Se escribe aqui, y no se importa, a proposito: hay dos funciones identicas en
 * `UserMenu` y en `RecentActivityCard`, las dos del portal interno, y este
 * encargo no toca el portal. Unificar las tres es un cambio propio.
 */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

export function CatalogHeader({
  sellerName,
  raffleName,
}: {
  sellerName: string
  raffleName: string
}) {
  const { titleDocked } = useCatalogSticky()

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[oklch(0.145_0.035_292_/_0.94)] pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
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
          no puede empujar nada fuera de la pantalla. `min-w-0` es lo que se lo
          permite: sin el, un hijo flexible no baja de su ancho de contenido.
        */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight font-semibold">{sellerName}</p>
          {/*
            La segunda linea dice el oficio mientras se ve el titulo, y la rifa
            cuando ya no. Nunca las dos, asi que el nombre de la rifa jamas se
            lee dos veces en la misma pantalla.
          */}
          <p className="text-muted-foreground truncate text-xs leading-tight">
            {titleDocked ? raffleName : 'Vendedor oficial'}
          </p>
        </div>
      </div>
    </header>
  )
}
