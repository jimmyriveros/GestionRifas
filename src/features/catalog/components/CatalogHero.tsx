import { getImageProps } from 'next/image'

import { CatalogHeroSearch } from './CatalogHeroSearch'
import { CatalogHeroTitle } from './CatalogHeroTitle'

/**
 * El hero del catalogo publico (D-163, ajustado en D-164).
 *
 * QUE HAY AQUI Y POR QUE. La etiqueta que dice donde estas, el titulo derivado
 * del nombre de la rifa, el texto de introduccion, el buscador y la composicion
 * del vehiculo. Es el orden en que se usa la pantalla: primero entiendo que
 * estoy viendo, luego busco mi numero.
 *
 * ART DIRECTION DE VERDAD, NO DOS IMAGENES OCULTAS CON CSS. Las dos
 * composiciones no son la misma foto recortada: la horizontal reparte el coche
 * a la izquierda y las boletas a la derecha, y la vertical deja arriba el hueco
 * donde va el texto y baja el coche. Se sirven con `<picture>` + `<source
 * media>`, que es el patron que documenta Next 16 para esto
 * (`node_modules/next/dist/docs/.../image.md`, «Art direction»): el navegador
 * evalua `media` ANTES de descargar y baja UNA de las dos, nunca las dos. Con
 * `hidden md:block` sobre dos `<img>` habria bajado las dos.
 *
 * `getImageProps` Y NO `<Image>`. Es lo que permite meter los `srcSet` dentro
 * de un `<picture>`; de paso, cada ancho recibe su derivado —un telefono de
 * 390 px no descarga los 213 KB de la composicion entera— sin escribir a mano
 * una lista de tamaños.
 *
 * NO SE PRECARGA NINGUNA DE LAS DOS. El elemento mas grande de la primera
 * pantalla es el titulo, que es texto y llega en el HTML; adelantar la imagen
 * con `priority` habria puesto un `<link rel=preload>` en la cabecera —de la
 * variante equivocada la mitad de las veces, porque el preload no entiende el
 * `media` del `<picture>`— compitiendo con la fuente y con el CSS. Se pide
 * `loading="eager"` para que no se retrase por ser decorativa, y nada mas.
 *
 * ES DECORATIVA: `alt=""`. No aporta ni un dato que no este escrito al lado, y
 * anunciarla obligaria a describir una camioneta a quien vino a buscar un
 * numero.
 *
 * EL RECORTE VIVE EN UNA CAPA PROPIA (D-164). Antes el `overflow-hidden` estaba
 * en la seccion entera; ahora envuelve solo a la ilustracion y al velo. El
 * motivo es el buscador: al posarse pasa a `position: fixed`, y un antepasado
 * que recorta es justo el tipo de vecino que puede dejarlo invisible. La
 * ilustracion se sigue recortando igual.
 */

const DESKTOP = '/images/catalog/catalog-hero-desktop-sportage-hev-2026.webp'
const MOBILE = '/images/catalog/catalog-hero-mobile-sportage-hev-2026.webp'

/** El ancho a partir del cual se sirve la composicion horizontal: `md`. */
const DESKTOP_MEDIA = '(min-width: 768px)'

function HeroArtwork() {
  const comun = { alt: '', sizes: '100vw', loading: 'eager' as const }

  const {
    props: { srcSet: escritorio },
  } = getImageProps({ ...comun, src: DESKTOP, width: 1672, height: 941 })

  const {
    props: { srcSet: movil, ...resto },
  } = getImageProps({ ...comun, src: MOBILE, width: 1024, height: 1536 })

  return (
    <picture>
      <source media={DESKTOP_MEDIA} srcSet={escritorio} sizes="100vw" />
      <source srcSet={movil} sizes="100vw" />
      {/*
        `object-cover` con anclajes distintos: en el telefono al pie, para que
        el coche quede abajo y el hueco de arriba lo ocupe el texto; en
        escritorio al centro, que es donde la composicion reparte coche y
        boletas a cada lado.

        `alt=""` se escribe APARTE del spread aunque `resto` ya lo traiga: la
        regla `jsx-a11y/alt-text` lee el JSX, no lo que hay dentro de un objeto,
        y sin esto avisa en cada build de que a esta imagen le falta el texto
        alternativo — un aviso que, de tanto repetirse, acaba tapando uno de
        verdad. Es decoración: el alt vacío es el correcto, no un descuido.
      */}
      <img
        {...resto}
        alt=""
        className="absolute inset-0 size-full object-cover object-[center_bottom] md:object-[center_45%]"
        style={{ ...resto.style }}
      />
    </picture>
  )
}

export function CatalogHero({ raffleName, intro }: { raffleName: string; intro: string }) {
  return (
    <section className="relative isolate">
      {/*
        La ilustracion y su velo, recortados aqui dentro. El velo es lo que hace
        legible el titulo, no un adorno: oscurece justo la zona donde va el
        texto y deja ver el coche y las boletas alrededor. Su forma cambia con
        el ancho —vertical en el telefono, radial en escritorio— y por eso vive
        en `globals.css` y no en una clase suelta.
      */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        <HeroArtwork />
        <div className="catalog-hero-veil absolute inset-0" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col justify-center px-4 pt-8 pb-40 md:min-h-[32rem] md:items-center md:py-16 md:text-center lg:min-h-[34rem]">
        <p className="border-primary/40 bg-primary/15 text-primary-foreground inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-[0.7rem] font-semibold tracking-[0.18em] uppercase">
          <span className="bg-secondary size-1.5 shrink-0 rounded-full" aria-hidden />
          Catálogo público
        </p>

        <CatalogHeroTitle raffleName={raffleName} />

        <p className="text-muted-foreground mt-4 max-w-xl text-sm text-pretty md:mx-auto md:text-base">
          {intro}
        </p>

        {/*
          El buscador va en el hero, como en el diseño de referencia, y no en el
          encabezado fijo: ahi ocupaba un tercio de la altura util de un telefono
          en todas las pantallas de la lista. Al perderse de vista se posa bajo
          el encabezado, sin dejar de ser el mismo campo (D-164).
        */}
        <div className="mt-6 w-full max-w-xl md:mx-auto">
          <CatalogHeroSearch />
        </div>
      </div>
    </section>
  )
}
