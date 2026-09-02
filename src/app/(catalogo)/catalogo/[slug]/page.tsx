import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ShieldCheckIcon } from 'lucide-react'

import { EmptyState } from '@/components/data/EmptyState'
import { CatalogHeader } from '@/features/catalog/components/CatalogHeader'
import { CatalogHero } from '@/features/catalog/components/CatalogHero'
import { CatalogPagination } from '@/features/catalog/components/CatalogPagination'
import { CatalogRefreshOnFocus } from '@/features/catalog/components/CatalogRefreshOnFocus'
import { CatalogSummary } from '@/features/catalog/components/CatalogSummary'
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
 * refresco al volver del foco—; las tarjetas, la reja, el encabezado fijo, el
 * hero y la paginacion se pintan aqui y llegan como HTML. El rediseño de D-163
 * no cambio esto: sus resplandores, su velo y su polvo de estrellas son CSS, y
 * la unica imagen es la composicion del hero.
 *
 * LO QUE EL REDISEÑO NO TOCO (D-163): la consulta, la proyeccion publica, el
 * buscador y su termino en la URL, la paginacion, el refresco al volver, los dos
 * estados de una boleta, el mensaje de WhatsApp y el aviso de que solicitar no
 * aparta el numero. Es un cambio de presentacion.
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

      <CatalogHeader
        sellerName={sellerName}
        sellerShortName={sellerShortName}
        whatsappNumber={whatsappNumber}
      />

      <main className="pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
        <CatalogHero raffleName={raffleName} intro={INTRO} />

        <div className="mx-auto w-full max-w-7xl px-4">
          <CatalogSummary
            tickets={tickets}
            searching={isSearching}
            partial={catalog.page > 1 || catalog.hasNextPage}
          />

          {tickets.length === 0 ? (
            <div className="mt-8">
              {isSearching ? (
                <EmptyState
                  title="No encontramos ese número"
                  description={CATALOG_SEARCH_EMPTY_DESCRIPTION}
                />
              ) : (
                <EmptyState
                  title="Todavía no hay números publicados"
                  description={`Escríbele a ${sellerShortName} por WhatsApp para preguntarle cuándo estarán disponibles.`}
                />
              )}
            </div>
          ) : (
            /*
              LA REJA CRECE CON LA PANTALLA, hasta cinco columnas. Se queda en
              DOS en el telefono, tambien a 320 px: una sola columna obligaria a
              desplazarse el doble para recorrer las mismas cincuenta boletas, y
              a ese ancho las dos caben —lo comprueba la suite del telefono, que
              mide que la insignia no tape la cifra—.
            */
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
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
            La aclaracion que el encargo pide mantener VISIBLE: tocar
            «Solicitar» no separa la boleta. Va al final y no dentro de cada
            tarjeta, para decirlo una vez en lugar de cincuenta. El escudo del
            diseño de referencia acompaña al aviso; no lo sustituye ni lo
            debilita, que es lo unico que ahi no se puede hacer.
          */}
          <p className="text-muted-foreground mx-auto mt-10 flex max-w-2xl items-start justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-xs text-pretty">
            <ShieldCheckIcon className="text-secondary mt-px size-4 shrink-0" aria-hidden />
            <span>
              Tocar «Solicitar» no aparta el número. {sellerShortName} te confirmará por WhatsApp si
              sigue disponible.
            </span>
          </p>
        </div>
      </main>
    </>
  )
}
