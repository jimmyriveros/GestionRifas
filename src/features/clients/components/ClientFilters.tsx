'use client'

import { XIcon } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SearchInput } from '@/features/search/components/SearchInput'
import { useUrlSearch } from '@/features/search/use-url-search'
import { tourTarget } from '@/features/tour/tours'
import { SEARCH_MIN_CHARS } from '@/lib/search'

const ALL = 'all'

/**
 * Filtros de clientes, compartidos por los dos portales. El selector de
 * vendedor solo aparece si se le pasan vendedores: en el portal del vendedor
 * todos los clientes son suyos y el filtro sobraria.
 */
export function ClientFilters({ sellers }: { sellers?: { value: string; label: string }[] }) {
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

  const hasFilters = ['q', 'sellerId', 'archived'].some((key) => searchParams.get(key))

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
        touchSize
        hint={search.hint}
      />

      <div className="flex flex-wrap items-end gap-4">
        {sellers ? (
          <div className="min-w-56 space-y-1.5">
            <Label htmlFor="client-seller" className="text-xs">
              Vendedor
            </Label>
            <Select
              value={searchParams.get('sellerId') ?? ALL}
              onValueChange={(value) => apply({ sellerId: value })}
              disabled={isPending}
            >
              <SelectTrigger id="client-seller" className="w-full">
                <SelectValue placeholder="Todos los vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los vendedores</SelectItem>
                {sellers.map((seller) => (
                  <SelectItem key={seller.value} value={seller.value}>
                    {seller.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

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
            onClick={() => apply({ q: null, sellerId: null, archived: null })}
          >
            <XIcon className="size-4" aria-hidden />
            Limpiar filtros
          </Button>
        ) : null}
      </div>
    </div>
  )
}
