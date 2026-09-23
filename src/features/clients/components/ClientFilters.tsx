'use client'

import { XIcon } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ListSortSelect } from '@/components/data/ListSortSelect'
import { SearchInput } from '@/features/search/components/SearchInput'
import { useUrlSearch } from '@/features/search/use-url-search'
import { tourTarget } from '@/features/tour/tours'

import { CLIENT_SORT_COLUMNS, CLIENT_SORT_OPTIONS, describeClientSort } from '../sort-options'
import { SEARCH_MIN_CHARS } from '@/lib/search'

const ALL = 'all'

/**
 * Filtros de «Mis clientes». Sin selector de vendedor: todos los clientes son
 * del vendedor que mira, y desde D-198 el portal administrativo no tiene
 * clientes que filtrar.
 */
export function ClientFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  // Personas: dos caracteres ya descartan casi toda la cartera.
  const search = useUrlSearch({ minChars: SEARCH_MIN_CHARS.people })

  function apply(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '' || value === ALL) params.delete(key)
      else params.set(key, value)
    }
    params.delete('page')
    const query = params.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  const hasFilters = ['q', 'archived'].some((key) => searchParams.get(key))

  return (
    <div
      {...tourTarget('filters')}
      // El recuadro agrupa buscador y filtros en escritorio. En el telefono
      // solo quedan el campo y el interruptor, y el borde era una caja dentro
      // de otra que ademas robaba ancho al buscador: bajo `md` se quita, igual
      // que en `TicketFilters` (D-108, D-136).
      className="space-y-2 md:space-y-3 md:rounded-lg md:border md:p-4"
    >
      <SearchInput
        id="client-search"
        label="Buscar cliente"
        hideLabel
        placeholder="Nombre, alias, teléfono o correo"
        value={search.value}
        onChange={search.onChange}
        onSubmit={search.submitNow}
        onClear={search.clear}
        loading={search.showSpinner}
        showSubmitButton
        size="touch"
        hint={search.hint}
      />

      {/* En el telefono no hay cabeceras que pulsar: la lista son tarjetas
          (D-136). El control va en su propia linea, encima del interruptor,
          porque primero se decide QUE se ve y despues en que orden. */}
      {/* Aqui la busqueda NO cambia el orden —es un `ilike` sobre la misma
          consulta—, asi que no hace falta `defaultLabel` (D-216). */}
      <ListSortSelect
        options={CLIENT_SORT_OPTIONS}
        allowed={CLIENT_SORT_COLUMNS}
        describe={describeClientSort}
        label="Ordenar los clientes"
        className="w-full md:hidden"
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id="client-archived"
            checked={searchParams.get('archived') === '1'}
            onCheckedChange={(checked) => apply({ archived: checked ? '1' : null })}
            disabled={isPending}
          />
          <Label htmlFor="client-archived" className="text-sm">
            Incluir archivados
          </Label>
        </div>

        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => apply({ q: null, archived: null })}
          >
            <XIcon className="size-4" aria-hidden />
            Limpiar filtros
          </Button>
        ) : null}
      </div>
    </div>
  )
}
