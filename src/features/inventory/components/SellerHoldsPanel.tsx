'use client'

import { ClockIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ClientOption } from '@/features/clients/queries'
import { AssignTicketsForm } from '@/features/tickets/assign/components/AssignTicketsForm'
import { LEGACY_NUMBER_FORMAT, numberFormatLegend } from '@/lib/ticket-number-format'
import { useClientCreated } from '@/features/whatsapp/components/ClientCreatedProvider'
import type { WhatsappSettings } from '@/features/whatsapp/invite'
import { ticketLabel } from '@/lib/tickets'

import { extendTicketHold, returnTicketHold } from '../actions'
import { INVENTORY_COPY } from '../copy'
import type { SellerTicketHold } from '../queries'
import { minutesLeft } from '../rules'
import { syncNowWithServer, useNow } from './use-now'

const C = INVENTORY_COPY.seller

/**
 * «Tus apartados» (D-257, BR-I24, BR-I25).
 *
 * Cada apartado vigente con lo que se puede hacer con el: venderlo, pedir sus 30
 * minutos de mas —una vez— o devolverlo. La cuenta atras es del telefono y solo
 * informa; la hora de vencimiento escrita viene de la base, y es la base la que
 * decide al confirmar: una venta con un apartado vencido no se guarda.
 *
 * LA VENTA ES LA DE SIEMPRE. El mismo `AssignTicketsForm` de «Asignar a un
 * cliente», con el apartado: elegir o crear el cliente, fecha, rebaja. Lo unico
 * que cambia es que viaja el `holdId`, y con el la base vende solo si ese es el
 * apartado vigente de esa boleta.
 */
export function SellerHoldsPanel({
  holds,
  activeCount,
  maxActive,
  clients,
  whatsappSettings,
}: {
  holds: SellerTicketHold[]
  activeCount: number
  maxActive: number
  clients: ClientOption[]
  whatsappSettings?: WhatsappSettings
}) {
  // Cada lectura trae la hora de la base: la cuenta atras se ajusta a ella.
  const serverNow = holds[0]?.serverNow
  useEffect(() => {
    if (serverNow) syncNowWithServer(serverNow)
  }, [serverNow])

  return (
    <section className="space-y-3" aria-labelledby="seller-holds-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="seller-holds-title" className="text-lg font-semibold">
          {C.holdsTitle}
        </h2>
        <p className="text-muted-foreground text-sm tabular-nums">
          {C.holdsCount(activeCount, maxActive)}
        </p>
      </div>

      {holds.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          {C.holdsEmpty}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {holds.map((hold) => (
            <HoldCard
              key={hold.holdId}
              hold={hold}
              clients={clients}
              whatsappSettings={whatsappSettings}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function HoldCard({
  hold,
  clients,
  whatsappSettings,
}: {
  hold: SellerTicketHold
  clients: ClientOption[]
  whatsappSettings?: WhatsappSettings
}) {
  const router = useRouter()
  const now = useNow()
  const showClientCreated = useClientCreated()
  const [saleOpen, setSaleOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const holdFormat = hold.numberFormat ?? LEGACY_NUMBER_FORMAT
  const numbers = ticketLabel(
    { dailyNumber: hold.dailyNumber, weeklyNumber: hold.weeklyNumber },
    holdFormat.groups.length,
  )
  const expiresMs = new Date(hold.expiresAt).getTime()
  // Nunca mas de lo que dura el apartado entero: entre que llega la lectura y
  // se ajusta el reloj hay un pintado con la hora anterior.
  const spanMinutes = Math.ceil((expiresMs - new Date(hold.startedAt).getTime()) / 60_000)
  const left = now === 0 ? null : Math.min(minutesLeft(expiresMs, now), spanMinutes)
  const expired = left === 0

  function extend() {
    startTransition(async () => {
      const result = await extendTicketHold({ holdId: hold.holdId })
      if ('error' in result) {
        toast.error(result.error)
        router.refresh()
        return
      }
      toast.success(
        result.data.outcome === 'already_extended'
          ? C.extended
          : C.extendedDone(result.data.expiresAt),
      )
      router.refresh()
    })
  }

  function giveBack() {
    startTransition(async () => {
      const result = await returnTicketHold({ holdId: hold.holdId })
      if ('error' in result) {
        toast.error(result.error)
        router.refresh()
        return
      }
      toast.success(C.returned)
      setReturnOpen(false)
      router.refresh()
    })
  }

  return (
    <li className="bg-card space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xl font-semibold tabular-nums">{numbers}</p>
          <p className="text-muted-foreground text-xs">{numberFormatLegend(holdFormat)}</p>
        </div>
        <div className="text-right text-sm">
          <p className="flex items-center justify-end gap-1.5 font-medium">
            <ClockIcon className="text-muted-foreground size-4" aria-hidden />
            {C.expiresAt(hold.expiresAt)}
          </p>
          {left !== null ? (
            <p className={expired ? 'text-destructive' : 'text-muted-foreground'}>
              {C.minutesLeft(left)}
            </p>
          ) : null}
        </div>
      </div>

      {expired ? (
        <p className="text-muted-foreground text-sm">{C.expired}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="touch"
            className="grow sm:grow-0"
            onClick={() => setSaleOpen(true)}
            disabled={isPending}
          >
            {C.sell}
            {/* Cada tarjeta tiene las mismas tres acciones: se oye cuál boleta (D-114). */}
            <span className="sr-only">{C.ticketSubject(numbers)}</span>
          </Button>
          {hold.extended ? (
            <p className="text-muted-foreground self-center text-xs">{C.extended}</p>
          ) : (
            <Button
              type="button"
              size="touch"
              variant="outline"
              className="grow sm:grow-0"
              onClick={extend}
              disabled={isPending}
            >
              {isPending ? C.extending : C.extend}
              <span className="sr-only">{C.extendSubject(numbers)}</span>
            </Button>
          )}
          <Button
            type="button"
            size="touch"
            variant="ghost"
            className="grow sm:grow-0"
            onClick={() => setReturnOpen(true)}
            disabled={isPending}
          >
            {C.return}
            <span className="sr-only">{C.ticketSubject(numbers)}</span>
          </Button>
        </div>
      )}

      <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{C.sellTitle(numbers)}</DialogTitle>
            <DialogDescription>{C.sellDescription}</DialogDescription>
          </DialogHeader>
          <AssignTicketsForm
            ticketIds={[hold.ticketId]}
            holdId={hold.holdId}
            totalAmount={hold.basePrice}
            clients={clients}
            priceRange={{ basePrice: hold.basePrice, minSalePrice: hold.minSalePrice }}
            onDone={() => setSaleOpen(false)}
            ticketLabel={numbers}
            onClientCreated={
              whatsappSettings
                ? (outcome) => showClientCreated({ outcome, settings: whatsappSettings })
                : undefined
            }
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        title={C.returnTitle(numbers)}
        description={C.returnDescription}
        confirmLabel={C.returnConfirm}
        pendingLabel={C.returning}
        pending={isPending}
        onConfirm={giveBack}
      />
    </li>
  )
}
