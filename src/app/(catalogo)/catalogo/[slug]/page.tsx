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
import { CatalogStickyProvider } from '@/features/catalog/sticky'
import { CATALOG_SEARCH_EMPTY_DESCRIPTION } from '@/features/search/hints'

/**
 * El catalogo publico de un vendedor: `/catalogo/<slug>` (D-159, BR-K01..BR-K14).
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
 * SOLO SE PUBLICAN BOLETAS DISPONIBLES (D-164). El filtro lo hace la base antes
 * de paginar, asi que una boleta vendida no llega al navegador ni ocupa sitio
 * en la paginacion. Lo que el visitante ve de las vendidas es su RECUENTO, en
 * la franja de cifras, y ese recuento es de todo el catalogo.
 *
 * DOS CONSULTAS, EN PARALELO, COMO ANTES. Los conteos viajan con los metadatos
 * (`0046`), no en una tercera llamada: son dos numeros que salen de un agregado
 * que ya recorre el mismo indice.
 */

export const dynamic = 'force-dynamic'

/**
 * Ya no dice «Los números en gris ya están tomados» (D-164): no hay numeros en
 * gris. Prometer un estado que la pagina no enseña dejaba a quien lee buscando
 * algo que no existe.
 */
const INTRO = "Elige el número que más te guste y toca 'Solicitar' para escribirnos por WhatsApp."

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

  const { tickets, sellerName, sellerShortName, whatsappNumber, raffleName, stats } = catalog
  const isSearching = search !== undefined && search !== ''

  return (
    /*
      El proveedor envuelve al encabezado Y al hero porque el primero necesita
      saber cuando el segundo se pierde de vista. Es lo unico que comparten.
    */
    <CatalogStickyProvider>
      <CatalogRefreshOnFocus />

      <CatalogHeader sellerName={sellerName} raffleName={raffleName} />

      <main className="pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
        <CatalogHero raffleName={raffleName} intro={INTRO} />

        <div className="mx-auto w-full max-w-7xl px-4">
          {/*
            Las cifras se pintan SIEMPRE que el catalogo exista, incluso cuando
            una busqueda no encuentra nada: son del catalogo entero, y quien
            busco un numero que no existe sigue necesitando saber cuantos
            quedan.
          */}
          <CatalogSummary stats={stats} />

          {tickets.length === 0 ? (
            <div className="mt-8">
              {isSearching ? (
                <EmptyState
                  title="No encontramos ese número entre los disponibles"
                  description={CATALOG_SEARCH_EMPTY_DESCRIPTION}
                />
              ) : (
                <EmptyState
                  title="Por ahora no quedan números disponibles"
                  description={`Escríbele a ${sellerShortName} por WhatsApp para preguntarle si va a publicar más.`}
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
            tarjeta, para decirlo una vez en lugar de cincuenta.
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
    </CatalogStickyProvider>
  )
}
