'use client'

import { XIcon } from 'lucide-react'
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
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/constants'

const ALL = 'all'
const METHODS: PaymentMethod[] = ['cash', 'transfer', 'other']

type Option = { value: string; label: string }

/** Filtros de la consulta global de pagos. Todo el estado vive en la URL. */
export function PaymentFilters({ sellers }: { sellers?: Option[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

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

  const hasFilters = ['sellerId', 'status', 'method', 'dateFrom', 'dateTo'].some((key) =>
    searchParams.get(key),
  )

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {sellers ? (
          <div className="space-y-1.5">
            <Label htmlFor="filter-payment-seller" className="text-xs">
              Vendedor
            </Label>
            <Select
              value={searchParams.get('sellerId') ?? ALL}
              onValueChange={(value) => apply({ sellerId: value })}
              disabled={isPending}
            >
              <SelectTrigger id="filter-payment-seller" className="w-full">
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

        <div className="space-y-1.5">
          <Label htmlFor="filter-payment-status" className="text-xs">
            Estado
          </Label>
          <Select
            value={searchParams.get('status') ?? ALL}
            onValueChange={(value) => apply({ status: value })}
            disabled={isPending}
          >
            <SelectTrigger id="filter-payment-status" className="w-full">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="voided">Anulados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-payment-method" className="text-xs">
            Metodo
          </Label>
          <Select
            value={searchParams.get('method') ?? ALL}
            onValueChange={(value) => apply({ method: value })}
            disabled={isPending}
          >
            <SelectTrigger id="filter-payment-method" className="w-full">
              <SelectValue placeholder="Todos los metodos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos los metodos</SelectItem>
              {METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-date-from" className="text-xs">
            Desde
          </Label>
          <Input
            id="filter-date-from"
            type="date"
            key={`from-${searchParams.get('dateFrom') ?? ''}`}
            defaultValue={searchParams.get('dateFrom') ?? ''}
            onChange={(event) => apply({ dateFrom: event.target.value })}
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-date-to" className="text-xs">
            Hasta
          </Label>
          <Input
            id="filter-date-to"
            type="date"
            key={`to-${searchParams.get('dateTo') ?? ''}`}
            defaultValue={searchParams.get('dateTo') ?? ''}
            onChange={(event) => apply({ dateTo: event.target.value })}
            disabled={isPending}
          />
        </div>
      </div>

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() =>
            apply({
              sellerId: null,
              status: null,
              method: null,
              dateFrom: null,
              dateTo: null,
              clientId: null,
            })
          }
        >
          <XIcon className="size-4" aria-hidden />
          Limpiar filtros
        </Button>
      ) : null}
    </div>
  )
}
