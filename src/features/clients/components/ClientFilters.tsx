'use client'

import { SearchIcon, XIcon } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const ALL = 'all'

export function ClientFilters({ sellers }: { sellers: { value: string; label: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const currentSearch = searchParams.get('q') ?? ''

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
    <div className="space-y-3 rounded-lg border p-4">
      {/* Campo no controlado, remontado con `key`: la URL es la fuente de
          verdad (mismo criterio que TicketFilters). */}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const value = new FormData(event.currentTarget).get('q')
          apply({ q: typeof value === 'string' ? value : null })
        }}
        className="flex gap-2"
      >
        <div className="flex-1">
          <Label htmlFor="client-search" className="sr-only">
            Buscar cliente
          </Label>
          <Input
            id="client-search"
            key={currentSearch}
            name="q"
            defaultValue={currentSearch}
            placeholder="Nombre, alias, telefono o correo"
            inputMode="search"
            disabled={isPending}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={isPending}>
          <SearchIcon className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Buscar</span>
        </Button>
      </form>

      <div className="flex flex-wrap items-end gap-4">
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
