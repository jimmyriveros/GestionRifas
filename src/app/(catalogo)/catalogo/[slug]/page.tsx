import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { EmptyState } from '@/components/data/EmptyState'
import { CatalogPagination } from '@/features/catalog/components/CatalogPagination'
import { CatalogRefreshOnFocus } from '@/features/catalog/components/CatalogRefreshOnFocus'
import { CatalogSearch } from '@/features/catalog/components/CatalogSearch'
import { CatalogTicketCard } from '@/features/catalog/components/CatalogTicketCard'
import { getPublicCatalog } from '@/features/catalog/queries'
import { CATALOG_SEARCH_EMPTY_DESCRIPTION } from '@/features/search/hints'

/**
 * El catalogo publico de un vendedor: `/catalogo/<slug>` (D-159, BR-K01..BR-K11).
 *
 * UNA SOLA RUTA PARA TODOS. No hay una pagina por vendedor ni un despliegue por
 * vendedor: el `slug` se resuelve en cada peticion y decide de quien es el
 * catalogo, que rifa se publica y a que WhatsApp escribe el boton.
 *
 * SIN SESION. La ruta esta declarada publica en `lib/supabase/proxy.ts`, asi que
 * el proxy no redirige a `/login`; sigue pasando por el, de modo que recibe la
 * Content-Security-Policy con su nonce como cualquier otra pantalla.
 *
 * DINAMICA A PROPOSITO. La disponibilidad de una boleta cambia cuando el
 * vendedor la vende, y una pagina cacheada enseñaria libre lo que ya no lo esta.
 * `force-dynamic` es lo unico que se toca de la estrategia de cache: la global
 * de la aplicacion no cambia.
 *
 * CASI TODO ES SERVIDOR. Solo dos piezas llevan JavaScript —el buscador y el
 * refresco al volver del foco—; las tarjetas, la reja, el encabezado fijo y la
 * paginacion se pintan aqui y llegan como HTML.
 */

export const dynamic = 'force-dynamic'

const INTRO =
  "Elige el número que más te guste y toca 'Solicitar' para escribirnos por WhatsApp. " +
  'Los números en gris ya están tomados.'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

/**
 * El titulo se DERIVA del nombre de la rifa, no se escribe en el codigo.
 *
 * Con la rifa llamada «Sorteo Camioneta Kia» sale exactamente «NÚMEROS
 * DISPONIBLES SORTEO CAMIONETA KIA», que es el texto pedido. Escribir ahi un
 * nombre comercial fijo habria obligado a tocar el codigo —y desplegar— cada
 * vez que la empresa cambie de premio, y habria mentido en cuanto hubiera una
 * segunda rifa.
 *
 * Se pasa a mayusculas en JavaScript y no con `text-transform` para que el
 * texto que se ve y el que esta en el HTML sean el mismo: asi lo que lee un
 * lector de pantalla, lo que copia quien selecciona y lo que comprueba una
 * prueba coinciden.
 */
function catalogTitle(raffleName: string): string {
  return `NÚMEROS DISPONIBLES ${raffleName.toUpperCase()}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const catalog = await getPublicCatalog({ slug })

  // Un catalogo que no existe no filtra nada por el titulo de la pestana.
  if (!catalog) return { title: 'Página no encontrada' }

  return {
    title: `${catalog.raffleName} · ${catalog.sellerName}`,
    description: `Números disponibles de ${catalog.raffleName}.`,
  }
}

export default async function PublicCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: SearchParams
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])

  const search = single(query.q)
  const requestedPage = Number.parseInt(single(query.page) ?? '1', 10)

  const catalog = await getPublicCatalog({
    slug,
    search,
    page: Number.isNaN(requestedPage) ? 1 : requestedPage,
  })

  // Vendedor inexistente, inactivo, organizacion inactiva, catalogo apagado o
  // rifa cerrada: la MISMA respuesta para todos (BR-K10). Distinguirlos diria a
  // cualquiera que ese enlace existio.
  if (!catalog) notFound()

  const { tickets, sellerName, sellerShortName, whatsappNumber, raffleName } = catalog
  const isSearching = search !== undefined && search !== ''

  return (
    <>
      <CatalogRefreshOnFocus />

      {/*
        ENCABEZADO FIJO CON `sticky`, NO CON `fixed` (BR-K01).
        `sticky` conserva el hueco del elemento en el flujo, asi que el contenido
        NO puede quedar debajo: no hay que compensar con un relleno superior que
        habria que corregir cada vez que el titulo pase a dos lineas. Y no hay un
        solo escuchador de scroll: lo resuelve el navegador.
      */}
      <header className="bg-background sticky top-0 z-40 border-b pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto w-full max-w-3xl space-y-2 px-4 py-3">
          <p className="text-muted-foreground truncate text-sm font-medium">{sellerName}</p>
          <h1 className="text-base leading-tight font-bold tracking-tight text-balance sm:text-lg">
            {catalogTitle(raffleName)}
          </h1>
          <CatalogSearch />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        <p className="text-muted-foreground mb-4 text-sm">{INTRO}</p>

        {tickets.length === 0 ? (
          isSearching ? (
            <EmptyState
              title="No encontramos ese número"
              description={CATALOG_SEARCH_EMPTY_DESCRIPTION}
            />
          ) : (
            <EmptyState
              title="Todavía no hay números publicados"
              description={`Escríbele a ${sellerShortName} por WhatsApp para preguntarle cuándo estarán disponibles.`}
            />
          )
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tickets.map((ticket) => (
              <CatalogTicketCard
                key={`${ticket.dailyNumber}-${ticket.weeklyNumber}`}
                ticket={ticket}
                sellerShortName={sellerShortName}
                whatsappNumber={whatsappNumber}
              />
            ))}
          </ul>
        )}

        <CatalogPagination page={catalog.page} hasNextPage={catalog.hasNextPage} search={search} />

        {/*
          La aclaracion que el encargo pide mantener VISIBLE: tocar «Solicitar»
          no separa la boleta. Va al final y no dentro de cada tarjeta, para
          decirlo una vez en lugar de cincuenta.
        */}
        <p className="text-muted-foreground mt-6 text-center text-xs">
          Tocar «Solicitar» no aparta el número. {sellerShortName} te confirmará por WhatsApp si
          sigue disponible.
        </p>
      </main>
    </>
  )
}
