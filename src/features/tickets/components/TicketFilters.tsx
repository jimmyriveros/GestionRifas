'use client'

import { SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { SearchInput } from '@/features/search/components/SearchInput'
import { ticketSearchHint } from '@/features/search/hints'
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
  /** Se omite donde se opera una sola rifa: el portal del vendedor (D-088). */
  raffles?: Option[]
  /** Solo el portal administrativo filtra por vendedor. */
  sellers?: Option[]
  /** Solo el portal del vendedor filtra por cliente. */
  clients?: Option[]
}

/** Valor centinela de shadcn/Select: no admite <SelectItem value="">. */
const ALL = 'all'

/** Los filtros que se pueden guardar detras del boton. La busqueda no: se ve siempre. */
const FILTER_KEYS = [
  'raffleId',
  'sellerId',
  'clientId',
  'inventoryStatus',
  'paymentStatus',
] as const

/**
 * Filtros de la lista de boletas. Todo el estado vive en la URL: la pagina es
 * compartible, sobrevive a un refresco y el RSC vuelve a consultar con los
 * filtros aplicados en SQL, no en el navegador.
 *
 * La busqueda es hibrida (`useUrlSearch`): sale sola tras la pausa al escribir,
 * o al momento con `Enter` o con el boton. El boton se conserva porque no todo
 * el mundo da por hecho que la busqueda pasa sola.
 *
 * DOS FORMAS DE MOSTRAR LOS MISMOS FILTROS (D-107). En escritorio sobra ancho y
 * los desplegables estan a la vista, como siempre. En un telefono ocupaban tres
 * bloques enteros ANTES del primer resultado: se guardan detras de un boton
 * «Filtros», que dice cuantos hay puestos, y se abren en una hoja inferior —al
 * alcance del pulgar— con el mismo contenido.
 *
 * El campo de busqueda NO se guarda ahi: es la forma normal de llegar a una
 * boleta y tiene que estar siempre visible.
 *
 * Los desplegables se escriben UNA vez (`filterFields`) y se pintan en los dos
 * sitios, con identificadores distintos para no repetir un `id` en la pagina.
 * La hoja solo existe en el DOM mientras esta abierta, y solo se puede abrir
 * bajo `md`: en escritorio no hay etiquetas duplicadas.
 */
export function TicketFilters({ raffles, sellers, clients }: TicketFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [sheetOpen, setSheetOpen] = useState(false)
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

  function clearAll() {
    apply({
      q: null,
      raffleId: null,
      sellerId: null,
      inventoryStatus: null,
      paymentStatus: null,
      clientId: null,
    })
  }

  // `raffleId` sigue en la lista aunque el selector no se muestre: un enlace
  // compartido puede traerlo, y entonces «Limpiar filtros» tiene que aparecer y
  // saber quitarlo. Ocultar el control no deja el filtro sin salida (D-088).
  const activeCount = FILTER_KEYS.filter((key) => searchParams.get(key)).length
  const hasFilters = activeCount > 0 || Boolean(searchParams.get('q'))

  /**
   * Los desplegables, una sola vez. `idPrefix` evita que la version de
   * escritorio y la de la hoja compartan `id`, que romperia las etiquetas.
   */
  function filterFields(idPrefix: string): ReactNode {
    return (
      <>
        {raffles ? (
          <FilterSelect
            id={`${idPrefix}-raffle`}
            label="Rifa"
            value={searchParams.get('raffleId') ?? ALL}
            onChange={(value) => apply({ raffleId: value })}
            options={raffles}
            allLabel="Todas las rifas"
            disabled={isPending}
          />
        ) : null}
        {sellers ? (
          <FilterSelect
            id={`${idPrefix}-seller`}
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
            id={`${idPrefix}-client`}
            label="Cliente"
            value={searchParams.get('clientId') ?? ALL}
            onChange={(value) => apply({ clientId: value })}
            options={clients}
            allLabel="Todos los clientes"
            disabled={isPending}
          />
        ) : null}
        <FilterSelect
          id={`${idPrefix}-inventory`}
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
          id={`${idPrefix}-payment`}
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
      </>
    )
  }

  return (
    <div {...tourTarget('filters')} className="space-y-3 rounded-lg border p-4">
      {/* UN solo campo para las dos formas de llegar a una boleta: sus numeros
          (BR-N11) o el nombre del cliente que la tiene (BR-N13). Nunca por el
          codigo interno. Quien busca no elige entre las dos: escribe lo que
          recuerda y la consulta distingue sola (D-100). */}
      <SearchInput
        id="ticket-search"
        label="Buscar por número de boleta o por cliente"
        hideLabel
        placeholder="Número de boleta o cliente"
        value={search.value}
        onChange={search.onChange}
        onSubmit={search.submitNow}
        onClear={search.clear}
        loading={search.showSpinner}
        showSubmitButton
        hint={ticketSearchHint(search.value) ?? search.hint}
      />

      {/* Telefono: un solo boton, que ademas dice cuantos filtros hay puestos.
          Asi los resultados empiezan casi debajo del buscador. */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="md:hidden">
            <SlidersHorizontalIcon className="size-4" aria-hidden />
            {activeCount === 0 ? 'Filtros' : `Filtros (${activeCount})`}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto pb-4">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>Elige qué boletas quieres ver en la lista.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4">{filterFields('filter-sheet')}</div>
          <div className="flex flex-col gap-2 px-4">
            {/* Limpiar cierra la hoja: quien la vacia quiere ver la lista
                entera, y no queda nada mas que tocar aqui. */}
            {hasFilters ? (
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  clearAll()
                  setSheetOpen(false)
                }}
              >
                <XIcon className="size-4" aria-hidden />
                Limpiar filtros
              </Button>
            ) : null}
            <SheetClose asChild>
              <Button type="button">Ver las boletas</Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>

      {/* Escritorio: los mismos desplegables, a la vista. */}
      <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
        {filterFields('filter')}
      </div>

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden md:inline-flex"
          disabled={isPending}
          onClick={clearAll}
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
