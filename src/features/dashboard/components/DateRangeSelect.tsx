'use client'

import { CalendarIcon } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

import {
  DASHBOARD_RANGE_KEYS,
  DASHBOARD_RANGE_LABELS,
  DEFAULT_DASHBOARD_RANGE,
  type DashboardRangeKey,
} from '../date-range'

type DateRangeSelectProps = {
  value: DashboardRangeKey
  /** Las dos fechas del periodo, ya escritas: «11–17 ago 2026». */
  rangeLabel: string
}

/**
 * Periodo del panel, arriba a la derecha (D-112).
 *
 * El estado vive en la URL, como los filtros de los reportes: el panel es un
 * componente de servidor que vuelve a consultar con el rango nuevo, y un
 * periodo elegido es una direccion que se puede guardar y volver a abrir. El
 * rango por defecto no se escribe en la URL, para que `/seller/dashboard` a
 * secas siga siendo la direccion del panel.
 *
 * EN EL BOTON SE LEEN LAS FECHAS, no el nombre de la opcion: «Últimos 7 días»
 * no dice cuales son esos siete dias, y esa es justamente la duda que aparece
 * al mirar una cifra. El nombre de la opcion esta dentro de la lista, con su
 * marca en la que esta puesta.
 */
export function DateRangeSelect({ value, rangeLabel }: DateRangeSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === DEFAULT_DASHBOARD_RANGE) params.delete('range')
    else params.set('range', next)

    const query = params.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  return (
    <Select value={value} onValueChange={change} disabled={isPending}>
      <SelectTrigger
        aria-label={`Período de las cifras: ${DASHBOARD_RANGE_LABELS[value]}`}
        className="h-11 w-full justify-between md:h-9 md:w-auto"
      >
        <span className="flex items-center gap-2">
          <CalendarIcon aria-hidden />
          <span className="tabular-nums">{rangeLabel}</span>
        </span>
      </SelectTrigger>
      {/*
        `position="popper"` no es decorativo. La colocacion por defecto de Radix
        —`item-aligned`— alinea la opcion elegida con el texto del boton, y para
        eso necesita un `SelectValue` que medir. Aqui el boton lleva las fechas
        escritas a mano, no hay `SelectValue`, y la lista aparecia en la esquina
        inferior izquierda de la pagina, a 1.400 px del boton. Anclada al boton
        no depende de esa medida.
      */}
      <SelectContent position="popper" align="end">
        {DASHBOARD_RANGE_KEYS.map((key) => (
          <SelectItem key={key} value={key}>
            {DASHBOARD_RANGE_LABELS[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
