'use client'

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'

type DataTablePaginationProps = {
  /** Total de filas que cumplen el filtro, no las de esta pagina. */
  total: number
  page: number
  pageSize: number
}

/**
 * Paginacion de SERVIDOR: escribe `page` en la URL y deja que el RSC vuelva a
 * consultar con `range()`. Mantener el estado en la URL hace que la pagina sea
 * compartible y sobreviva a un refresco.
 */
export function DataTablePagination({ total, page, pageSize }: DataTablePaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (nextPage <= 1) {
      params.delete('page')
    } else {
      params.set('page', String(nextPage))
    }
    const query = params.toString()
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname)
    })
  }

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {total === 0 ? 'Sin resultados' : `Mostrando ${from}–${to} de ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1 || isPending}
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          Anterior
        </Button>
        <span className="text-sm">
          Pagina {page} de {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages || isPending}
        >
          Siguiente
          <ChevronRightIcon className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
