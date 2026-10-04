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
import { SearchInput } from '@/features/search/components/SearchInput'
import { useUrlSearch } from '@/features/search/use-url-search'
import { searchParamsToBuildOn } from '@/lib/navigation-start'
import { SEARCH_MIN_CHARS } from '@/lib/search'

import { SETTLEMENT_COPY } from '../copy'
import { SETTLEMENT_STATUS_FILTERS, type SettlementStatusFilter } from '../schemas'

const COPY = SETTLEMENT_COPY.staffList

/**
 * Buscar un vendedor y filtrar por el estado de su cuenta. Todo vive en la URL
 * (`q`, `status`) y el servidor vuelve a consultar filtrando en PostgreSQL; la
 * rifa se conserva.
 *
 * Los dos campos se alinean ARRIBA: el buscador reserva debajo el hueco de su
 * pista (para que la lista no salte), y alinear abajo los descuadraba.
 */
export function SettlementListFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const search = useUrlSearch({ minChars: SEARCH_MIN_CHARS.people })
  const raw = searchParams.get('status') ?? 'all'
  const status: SettlementStatusFilter = (SETTLEMENT_STATUS_FILTERS as readonly string[]).includes(
    raw,
  )
    ? (raw as SettlementStatusFilter)
    : 'all'

  function apply(changes: Record<string, string | null>) {
    // Sobre la última dirección pedida, no la pintada: una búsqueda en camino se queda (I-200).
    const params = searchParamsToBuildOn(pathname, searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '' || value === 'all') params.delete(key)
      else params.set(key, value)
    }
    params.delete('page')
    const query = params.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  const hasFilters = Boolean(searchParams.get('q')) || status !== 'all'

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-4 gap-y-2 md:grid-cols-[minmax(0,22rem)_minmax(0,15rem)]">
        <SearchInput
          id="settlement-search"
          label={COPY.searchLabel}
          placeholder={COPY.searchPlaceholder}
          value={search.value}
          onChange={search.onChange}
          onSubmit={search.submitNow}
          onClear={search.clear}
          loading={search.showSpinner}
          size="touch"
          hint={search.hint}
        />
        <div className="space-y-1.5">
          <Label htmlFor="settlement-status">{COPY.statusLabel}</Label>
          <Select
            value={status}
            onValueChange={(value) => apply({ status: value })}
            disabled={isPending}
          >
            <SelectTrigger id="settlement-status" size="touch" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SETTLEMENT_STATUS_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {COPY.statusOptions[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => apply({ q: null, status: null })}
        >
          <XIcon className="size-4" aria-hidden />
          {COPY.clearFilters}
        </Button>
      ) : null}
    </div>
  )
}
