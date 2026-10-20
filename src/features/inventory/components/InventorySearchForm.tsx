'use client'

import { SearchIcon } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useId, useState, useTransition, type FormEvent } from 'react'

import { TicketNumberInput } from '@/components/form/TicketNumberInput'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  LEGACY_NUMBER_FORMAT,
  numberGroupTitle,
  type RaffleNumberFormat,
} from '@/lib/ticket-number-format'

import { INVENTORY_COPY } from '../copy'

const C = INVENTORY_COPY.seller

/**
 * El buscador del catalogo interno: numero diario, numero semanal o los dos, y
 * si se ven solo las libres o todas (D-257, BR-I20).
 *
 * TODO VIVE EN LA URL, como en el resto de listas: la pagina es compartible,
 * sobrevive a un refresco y la base filtra. Es un formulario GET de verdad: sin
 * JavaScript tambien busca. Con JavaScript, navega sin recargar y sin perder lo
 * escrito.
 */
export function InventorySearchForm({
  raffleId,
  daily,
  weekly,
  show,
  numberFormat = LEGACY_NUMBER_FORMAT,
}: {
  raffleId: string | null
  daily: string
  weekly: string
  show: 'free' | 'all'
  /** D-261: los números de la rifa: cuántos campos y cómo se llaman. */
  numberFormat?: RaffleNumberFormat
}) {
  const [firstGroup, secondGroup] = numberFormat.groups
  const router = useRouter()
  const pathname = usePathname()
  const id = useId()
  const [dailyValue, setDailyValue] = useState(daily)
  const [weeklyValue, setWeeklyValue] = useState(weekly)
  const [showValue, setShowValue] = useState(show)
  const [isPending, startTransition] = useTransition()

  function go(next: { daily: string; weekly: string; show: 'free' | 'all' }) {
    const params = new URLSearchParams()
    if (raffleId) params.set('raffleId', raffleId)
    if (next.daily) params.set('daily', next.daily)
    if (next.weekly) params.set('weekly', next.weekly)
    if (next.show === 'all') params.set('show', 'all')
    const query = params.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    go({ daily: dailyValue, weekly: weeklyValue, show: showValue })
  }

  function clear() {
    setDailyValue('')
    setWeeklyValue('')
    setShowValue('free')
    go({ daily: '', weekly: '', show: 'free' })
  }

  const hasSearch = daily !== '' || weekly !== '' || show === 'all'

  return (
    <form
      method="get"
      onSubmit={submit}
      role="search"
      aria-label={C.searchLegend}
      className="space-y-3 md:rounded-lg md:border md:p-4"
    >
      {raffleId ? <input type="hidden" name="raffleId" value={raffleId} /> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end">
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`${id}-daily`}>{numberGroupTitle(firstGroup.name)}</Label>
          <TicketNumberInput
            id={`${id}-daily`}
            name="daily"
            value={dailyValue}
            onChange={setDailyValue}
            placeholder={`Ejemplo: ${'1234'.slice(-firstGroup.digits)}`}
            maxDigits={firstGroup.digits}
            aria-describedby={`${id}-hint`}
          />
        </div>
        {secondGroup ? (
          <div className="grid content-start gap-1.5">
            <Label htmlFor={`${id}-weekly`}>{numberGroupTitle(secondGroup.name)}</Label>
            <TicketNumberInput
              id={`${id}-weekly`}
              name="weekly"
              value={weeklyValue}
              onChange={setWeeklyValue}
              placeholder={`Ejemplo: ${'56'.slice(-secondGroup.digits)}`}
              maxDigits={secondGroup.digits}
              aria-describedby={`${id}-hint`}
            />
          </div>
        ) : null}
        <div className="col-span-2 grid content-start gap-1.5 md:col-span-1">
          <Label htmlFor={`${id}-show`}>{C.showLabel}</Label>
          <Select
            name="show"
            value={showValue}
            onValueChange={(value) => setShowValue(value === 'all' ? 'all' : 'free')}
          >
            <SelectTrigger id={`${id}-show`} className="h-11 w-full md:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">{C.showFree}</SelectItem>
              <SelectItem value="all">{C.showAll}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 flex gap-2 md:col-span-1">
          <Button type="submit" size="touch" className="grow md:grow-0" disabled={isPending}>
            <SearchIcon className="size-4" aria-hidden />
            {C.search}
          </Button>
          {hasSearch ? (
            <Button
              type="button"
              size="touch"
              variant="ghost"
              className="grow md:grow-0"
              onClick={clear}
              disabled={isPending}
            >
              {C.clear}
            </Button>
          ) : null}
        </div>
      </div>
      <p id={`${id}-hint`} className="text-muted-foreground text-sm">
        {secondGroup ? C.searchHint : C.searchHintSingle}
      </p>
    </form>
  )
}
