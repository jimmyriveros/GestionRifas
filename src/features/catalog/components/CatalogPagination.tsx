import Link from 'next/link'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Paginacion de la reja publica (BR-K11).
 *
 * NO SE REUTILIZA `DataTablePagination`, y no por gusto: aquel componente
 * necesita el TOTAL de filas para escribir «1–25 de 118 boletas», y aqui no hay
 * total a proposito. Contar el inventario entero en cada pagina es justo el
 * coste que el encargo pide evitar: se piden `PAGE_SIZE + 1` boletas y la fila
 * sobrante dice si hay una pagina mas, nada mas.
 *
 * SON DOS ENLACES, NO DOS BOTONES. Asi la paginacion funciona sin una linea de
 * JavaScript, se puede abrir en otra pestana y el navegador la precarga. El
 * numero de pagina viaja en la URL junto al termino de busqueda, de modo que la
 * direccion es compartible y sobrevive a un refresco.
 *
 * En la primera pagina «Anterior» no se dibuja como boton muerto: no se dibuja.
 * Un `<a>` deshabilitado no existe en HTML, y fingirlo con `aria-disabled`
 * dejaria una parada de teclado que no lleva a ninguna parte. El hueco se
 * reserva igual para que «Siguiente» no cambie de sitio.
 */

function pageHref(page: number, search: string | undefined): string {
  const params = new URLSearchParams()
  if (search) params.set('q', search)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `?${query}` : '?'
}

export function CatalogPagination({
  page,
  hasNextPage,
  search,
}: {
  page: number
  hasNextPage: boolean
  search: string | undefined
}) {
  const hasPreviousPage = page > 1
  if (!hasPreviousPage && !hasNextPage) return null

  return (
    <nav className="mt-6 flex items-center justify-between gap-2" aria-label="Páginas de boletas">
      <div className="flex-1">
        {hasPreviousPage ? (
          <Button asChild variant="outline" className="h-11 md:h-9">
            <Link href={pageHref(page - 1, search)} prefetch={false}>
              <ChevronLeftIcon className="size-4" aria-hidden />
              Anterior
            </Link>
          </Button>
        ) : null}
      </div>

      <p className="text-muted-foreground shrink-0 text-sm tabular-nums">
        <span className="sr-only">Página </span>
        {page}
      </p>

      <div className="flex flex-1 justify-end">
        {hasNextPage ? (
          <Button asChild variant="outline" className="h-11 md:h-9">
            <Link href={pageHref(page + 1, search)} prefetch={false}>
              Siguiente
              <ChevronRightIcon className="size-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  )
}
