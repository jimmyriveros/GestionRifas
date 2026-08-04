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

import { REPORT_FILTER_FIELDS, type ReportKey } from '../schemas'

/**
 * Filtros de los reportes (CLAUDE.md §24).
 *
 * Solo se muestran los que el reporte visible entiende: ofrecer un rango de
 * fechas en «Boletas por rifa» invitaria a filtrar por algo que no se aplica.
 * La lista vive en `REPORT_FILTER_FIELDS`, junto a la definicion del reporte,
 * para que pantalla y consulta no puedan discrepar.
 *
 * Todo el estado esta en la URL: el RSC vuelve a consultar filtrando en SQL y
 * el enlace de exportacion reutiliza exactamente los mismos parametros.
 */

const ALL = 'all'
const METHODS: PaymentMethod[] = ['cash', 'transfer', 'other']

type Option = { value: string; label: string }

type ReportFiltersProps = {
  report: ReportKey
  raffles?: Option[]
  /** Ausente en el portal del vendedor: alli solo hay un vendedor posible. */
  sellers?: Option[]
}

export function ReportFilters({ report, raffles, sellers }: ReportFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const fields = REPORT_FILTER_FIELDS[report]
  const showRaffle = fields.includes('raffle') && raffles !== undefined
  const showSeller = fields.includes('seller') && sellers !== undefined
  const showDates = fields.includes('dates')
  const showMethod = fields.includes('method')
  const showStatus = fields.includes('status')

  const anyVisible = showRaffle || showSeller || showDates || showMethod || showStatus
  if (!anyVisible) return null

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

  const activeKeys = ['raffleId', 'sellerId', 'dateFrom', 'dateTo', 'method', 'status'].filter(
    (key) => searchParams.get(key),
  )

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {showRaffle ? (
          <div className="space-y-1.5">
            <Label htmlFor="report-raffle" className="text-xs">
              Rifa
            </Label>
            <Select
              value={searchParams.get('raffleId') ?? ALL}
              onValueChange={(value) => apply({ raffleId: value })}
              disabled={isPending}
            >
              <SelectTrigger id="report-raffle" className="w-full">
                <SelectValue placeholder="Todas las rifas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas las rifas</SelectItem>
                {raffles?.map((raffle) => (
                  <SelectItem key={raffle.value} value={raffle.value}>
                    {raffle.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {showSeller ? (
          <div className="space-y-1.5">
            <Label htmlFor="report-seller" className="text-xs">
              Vendedor
            </Label>
            <Select
              value={searchParams.get('sellerId') ?? ALL}
              onValueChange={(value) => apply({ sellerId: value })}
              disabled={isPending}
            >
              <SelectTrigger id="report-seller" className="w-full">
                <SelectValue placeholder="Todos los vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos los vendedores</SelectItem>
                {sellers?.map((seller) => (
                  <SelectItem key={seller.value} value={seller.value}>
                    {seller.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {showDates ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="report-date-from" className="text-xs">
                Desde
              </Label>
              <Input
                id="report-date-from"
                type="date"
                key={`from-${searchParams.get('dateFrom') ?? ''}`}
                defaultValue={searchParams.get('dateFrom') ?? ''}
                onChange={(event) => apply({ dateFrom: event.target.value })}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-date-to" className="text-xs">
                Hasta
              </Label>
              <Input
                id="report-date-to"
                type="date"
                key={`to-${searchParams.get('dateTo') ?? ''}`}
                defaultValue={searchParams.get('dateTo') ?? ''}
                onChange={(event) => apply({ dateTo: event.target.value })}
                disabled={isPending}
              />
            </div>
          </>
        ) : null}

        {showMethod ? (
          <div className="space-y-1.5">
            <Label htmlFor="report-method" className="text-xs">
              Metodo
            </Label>
            <Select
              value={searchParams.get('method') ?? ALL}
              onValueChange={(value) => apply({ method: value })}
              disabled={isPending}
            >
              <SelectTrigger id="report-method" className="w-full">
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
        ) : null}

        {showStatus ? (
          <div className="space-y-1.5">
            <Label htmlFor="report-status" className="text-xs">
              Estado del pago
            </Label>
            <Select
              value={searchParams.get('status') ?? ALL}
              onValueChange={(value) => apply({ status: value })}
              disabled={isPending}
            >
              <SelectTrigger id="report-status" className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                <SelectItem value="active">Vigentes</SelectItem>
                <SelectItem value="voided">Anulados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {activeKeys.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() =>
            apply({
              raffleId: null,
              sellerId: null,
              dateFrom: null,
              dateTo: null,
              method: null,
              status: null,
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
