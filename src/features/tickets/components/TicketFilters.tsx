'use client'

import { XIcon } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SearchInput } from '@/features/search/components/SearchInput'
import { useUrlSearch } from '@/features/search/use-url-search'
import { tourTarget } from '@/features/tour/tours'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TICKET_INVENTORY_STATUS_LABELS,
  TICKET_INVENTORY_STATUS_VALUES,
  TICKET_PAYMENT_STATUS_LABELS,
  TICKET_PAYMENT_STATUS_VALUES,
} from '@/lib/constants'
import { SEARCH_MIN_CHARS } from '@/lib/search'

type Option = { value: string; label: string }

type TicketFiltersProps = {
  raffles: Option[]
  /** Solo el portal administrativo filtra por vendedor. */
  sellers?: Option[]
  /** Solo el portal del vendedor filtra por cliente. */
  clients?: Option[]
}

/** Valor centinela de shadcn/Select: no admite <SelectItem value="">. */
const ALL = 'all'

/**
 * Filtros de la tabla de boletas. Todo el estado vive en la URL: la pagina es
 * compartible, sobrevive a un refresco y el RSC vuelve a consultar con los
 * filtros aplicados en SQL, no en el navegador.
 *
 * La busqueda es hibrida (`useUrlSearch`): sale sola tras la pausa al escribir,
 * o al momento con `Enter` o con el boton. El boton se conserva porque no todo
 * el mundo da por hecho que la busqueda pasa sola.
 */
export function TicketFilters({ raffles, sellers, clients }: TicketFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const search = useUrlSearch({ minChars: SEARCH_MIN_CHARS.tickets })

  function apply(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '' || value === ALL) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    // Cambiar un filtro invalida la pagina en la que estabas.
    params.delete('page')
    const query = params.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  const hasFilters = [
    'q',
    'raffleId',
    'sellerId',
    'clientId',
    'inventoryStatus',
    'paymentStatus',
  ].some((key) => searchParams.get(key))

  return (
    <div {...tourTarget('filters')} className="space-y-3 rounded-lg border p-4">
      <SearchInput
        id="ticket-search"
        label="Buscar por código o número"
        hideLabel
        placeholder="Código interno, número diario o semanal"
        value={search.value}
        onChange={search.onChange}
        onSubmit={search.submitNow}
        onClear={search.clear}
        loading={search.showSpinner}
        showSubmitButton
        hint={search.hint}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect
          id="filter-raffle"
          label="Rifa"
          value={searchParams.get('raffleId') ?? ALL}
          onChange={(value) => apply({ raffleId: value })}
          options={raffles}
          allLabel="Todas las rifas"
          disabled={isPending}
        />
        {sellers ? (
          <FilterSelect
            id="filter-seller"
            label="Vendedor"
            value={searchParams.get('sellerId') ?? ALL}
            onChange={(value) => apply({ sellerId: value })}
            options={sellers}
            allLabel="Todos los vendedores"
            disabled={isPending}
          />
        ) : null}
        {clients ? (
          <FilterSelect
            id="filter-client"
            label="Cliente"
            value={searchParams.get('clientId') ?? ALL}
            onChange={(value) => apply({ clientId: value })}
            options={clients}
            allLabel="Todos los clientes"
            disabled={isPending}
          />
        ) : null}
        <FilterSelect
          id="filter-inventory"
          label="Estado de la boleta"
          value={searchParams.get('inventoryStatus') ?? ALL}
          onChange={(value) => apply({ inventoryStatus: value })}
          options={TICKET_INVENTORY_STATUS_VALUES.map((status) => ({
            value: status,
            label: TICKET_INVENTORY_STATUS_LABELS[status],
          }))}
          allLabel="Todos los estados"
          disabled={isPending}
        />
        <FilterSelect
          id="filter-payment"
          label="Estado de pago"
          value={searchParams.get('paymentStatus') ?? ALL}
          onChange={(value) => apply({ paymentStatus: value })}
          options={TICKET_PAYMENT_STATUS_VALUES.map((status) => ({
            value: status,
            label: TICKET_PAYMENT_STATUS_LABELS[status],
          }))}
          allLabel="Todos los pagos"
          disabled={isPending}
        />
      </div>

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() =>
            apply({
              q: null,
              raffleId: null,
              sellerId: null,
              inventoryStatus: null,
              paymentStatus: null,
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

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  allLabel,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: Option[]
  allLabel: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
