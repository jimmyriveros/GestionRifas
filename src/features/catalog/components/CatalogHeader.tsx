'use client'

import { useCatalogSticky } from '../sticky'
import { CatalogSearch } from './CatalogSearch'

/**
 * El encabezado fijo del catalogo publico (BR-K01, D-163, D-164, D-165).
 *
 * QUIEN ES, DONDE ESTAS Y COMO BUSCAR. Dice de quien es el catalogo; cuando el
 * titulo del hero se pierde de vista recoge tambien el nombre de la rifa, y
 * cuando el buscador del hero se pierde de vista lo recoge **en la misma fila**.
 * No hay boton general de WhatsApp: el unico camino es «Solicitar», que si
 * nombra la boleta (D-164).
 *
 * UNA SOLA SUPERFICIE FIJA, Y UNA SOLA FILA (D-165). Antes el buscador se posaba
 * en una franja `fixed` propia debajo del encabezado: sumaba casi 70 px de
 * altura fija, dejaba una banda vacia y llegaba a taparle el resumen al llegar.
 * Ahora entra en la fila que ya existia, a la derecha de la identidad, y no hay
 * nada mas pegado a la pantalla.
 *
 * `sticky` Y NO `fixed`. `sticky` conserva el hueco del elemento en el flujo,
 * asi que el contenido NO puede quedar debajo: no hay que compensar con un
 * relleno superior que habria que corregir cada vez que cambie el alto.
 *
 * EL ALTO ES FIJO —`h-14`— Y ESO NO ES ESTETICA. Ni recoger el titulo ni
 * recoger el buscador puede mover el contenido de la pagina: si el encabezado
 * creciera, el elemento observado se desplazaria y el observador entraria en un
 * bucle de aparecer y desaparecer (ver `sticky.tsx`). Por eso el nombre de la
 * rifa SUSTITUYE a «Vendedor oficial» en vez de anadir una linea, y por eso el
 * campo mide 40 px dentro de una fila de 56.
 *
 * ES EL UNICO `<header>` DE LA PAGINA. El hero es un `<section>`.
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
  const { titleDocked, searchDocked } = useCatalogSticky()

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[oklch(0.145_0.035_292_/_0.94)] pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:gap-3">
        <span
          className="ring-primary/40 flex size-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(140deg,oklch(0.6_0.24_298),oklch(0.42_0.2_285))] text-xs font-semibold text-white ring-1"
          aria-hidden
        >
          {initialsFor(sellerName)}
        </span>

        {/*
          LA IDENTIDAD CEDE ANCHO AL BUSCADOR, no al reves. Con el campo dentro,
          en el telefono se reparte ~38 % para el nombre y el resto para buscar;
          desde `sm` la identidad ocupa lo que necesite y el campo se va a la
          derecha con su propio ancho.

          El nombre es el PRIMER `<p>` del encabezado y se recorta con puntos
          suspensivos: «Maria Fernanda del Sagrado Corazon Restrepo Villalobos»
          no puede empujar nada fuera de la pantalla. `min-w-0` es lo que se lo
          permite: sin el, un hijo flexible no baja de su ancho de contenido.
        */}
        <div className="min-w-0 flex-1 basis-0 sm:flex-none sm:basis-auto sm:pr-3">
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

        {/*
          EL DESTINO DEL BUSCADOR. Solo existe cuando el del hero se ha perdido
          de vista, asi que nunca hay dos campos en la pagina. `ms-auto` lo
          empuja a la derecha en las pantallas anchas; el ancho se acota entre
          320 y 520 px para que no se estire de lado a lado en un monitor.
        */}
        {searchDocked ? (
          <div className="ms-auto min-w-0 flex-[1.6] basis-0 sm:w-[min(520px,42vw)] sm:min-w-[320px] sm:flex-none sm:basis-auto">
            <CatalogSearch compact />
          </div>
        ) : null}
      </div>
    </header>
  )
}
