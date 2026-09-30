'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { SETTLEMENT_COPY } from '../copy'

/**
 * La rifa de las cuentas, en la URL (`?raffleId=`).
 *
 * Una cuenta es de UNA rifa: lo que se entrega, los premios y el cierre son de
 * esa rifa y de ninguna otra. Cambiar de rifa descarta la busqueda, el filtro y
 * la pagina, porque hablaban de otras cuentas.
 */
export function SettlementRaffleSelect({
  raffles,
  value,
}: {
  raffles: Array<{ value: string; label: string }>
  value: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="space-y-1.5" aria-busy={isPending}>
      <Label htmlFor="settlement-raffle">{SETTLEMENT_COPY.raffle.label}</Label>
      <Select
        value={value}
        onValueChange={(next) =>
          startTransition(() => router.push(`${pathname}?raffleId=${encodeURIComponent(next)}`))
        }
        disabled={isPending}
      >
        <SelectTrigger id="settlement-raffle" size="touch" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {raffles.map((raffle) => (
            <SelectItem key={raffle.value} value={raffle.value}>
              {raffle.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
