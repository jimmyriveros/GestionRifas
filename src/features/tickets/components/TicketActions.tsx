'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { TicketNumberInput } from '@/components/form/TicketNumberInput'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { approveTickets, cancelTicket, reassignTicketSeller, updateTicketNumbers } from '../actions'
import type { TicketDetail } from '../queries'
import { cancelTicketSchema, updateTicketNumbersSchema } from '../schemas'

type TicketActionsProps = {
  ticket: TicketDetail
  sellers: { id: string; fullName: string }[]
}

export function TicketActions({ ticket, sellers }: TicketActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [numbersOpen, setNumbersOpen] = useState(false)
  const [daily, setDaily] = useState(ticket.dailyNumber ?? '')
  const [weekly, setWeekly] = useState(ticket.weeklyNumber ?? '')
  const [numbersError, setNumbersError] = useState<string | null>(null)

  const [sellerOpen, setSellerOpen] = useState(false)
  const [sellerId, setSellerId] = useState(ticket.sellerId)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  const isCancelled = ticket.inventoryStatus === 'cancelled'
  const canChangeSeller = !isCancelled && ticket.inventoryStatus !== 'assigned'

  function saveNumbers() {
    const parsed = updateTicketNumbersSchema.safeParse({
      ticketId: ticket.id,
      dailyNumber: daily,
      weeklyNumber: weekly,
    })
    if (!parsed.success) {
      setNumbersError(parsed.error.issues[0]?.message ?? 'Revisa los numeros.')
      return
    }
    setNumbersError(null)

    startTransition(async () => {
      const result = await updateTicketNumbers(parsed.data)
      if ('error' in result) {
        setNumbersError(result.error)
        return
      }
      toast.success('Numeros actualizados.')
      setNumbersOpen(false)
      router.refresh()
    })
  }

  function saveSeller() {
    startTransition(async () => {
      const result = await reassignTicketSeller({ ticketId: ticket.id, sellerId })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Boleta reasignada.')
      setSellerOpen(false)
      router.refresh()
    })
  }

  function approve() {
    startTransition(async () => {
      const result = await approveTickets({ ticketIds: [ticket.id] })
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Boleta aprobada. Ya esta disponible para asignarse.')
        router.refresh()
      }
    })
  }

  function confirmCancel() {
    const parsed = cancelTicketSchema.safeParse({ ticketId: ticket.id, reason })
    if (!parsed.success) {
      setCancelError(parsed.error.issues[0]?.message ?? 'Revisa el motivo.')
      return
    }
    setCancelError(null)

    startTransition(async () => {
      const result = await cancelTicket(parsed.data)
      if ('error' in result) {
        setCancelError(result.error)
        return
      }
      toast.success('Boleta anulada.')
      setCancelOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      {ticket.inventoryStatus === 'pending_approval' ? (
        <Button type="button" onClick={approve} disabled={isPending}>
          Aprobar boleta
        </Button>
      ) : null}

      {!isCancelled ? (
        <Button type="button" variant="outline" onClick={() => setNumbersOpen(true)}>
          Editar numeros
        </Button>
      ) : null}

      {canChangeSeller ? (
        <Button type="button" variant="outline" onClick={() => setSellerOpen(true)}>
          Cambiar vendedor
        </Button>
      ) : null}

      {!isCancelled ? (
        <Button type="button" variant="destructive" onClick={() => setCancelOpen(true)}>
          Anular boleta
        </Button>
      ) : null}

      <Dialog open={numbersOpen} onOpenChange={setNumbersOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar numeros</DialogTitle>
            <DialogDescription>
              Entre 1 y 4 digitos. Los ceros iniciales importan: 007 no es lo mismo que 7.
            </DialogDescription>
          </DialogHeader>

          {numbersError ? (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
            >
              {numbersError}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="daily-number">Numero diario</Label>
              <TicketNumberInput id="daily-number" value={daily} onChange={setDaily} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weekly-number">Numero semanal</Label>
              <TicketNumberInput id="weekly-number" value={weekly} onChange={setWeekly} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNumbersOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={saveNumbers} disabled={isPending}>
              {isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sellerOpen} onOpenChange={setSellerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar vendedor</DialogTitle>
            <DialogDescription>
              Solo es posible mientras la boleta no este asignada a un cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-seller">Vendedor</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger id="ticket-seller" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sellers.map((seller) => (
                  <SelectItem key={seller.id} value={seller.id}>
                    {seller.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSellerOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={saveSeller} disabled={isPending || sellerId === ticket.sellerId}>
              {isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open)
          if (!open) setCancelError(null)
        }}
        title="Anular boleta"
        description="La boleta deja de ser utilizable y su combinacion de numeros no podra reutilizarse en esta rifa. Es una accion definitiva."
        confirmLabel="Anular"
        destructive
        pending={isPending}
        onConfirm={confirmCancel}
      >
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">Motivo (obligatorio)</Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explica por que se anula esta boleta"
          />
          {cancelError ? (
            <p role="alert" className="text-destructive text-sm">
              {cancelError}
            </p>
          ) : null}
        </div>
      </ConfirmDialog>
    </>
  )
}
