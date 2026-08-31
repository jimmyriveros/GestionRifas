'use client'

import { CheckIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { TicketNumberInput } from '@/components/form/TicketNumberInput'
import { CompactActionSlot } from '@/components/layout/CompactHeader'
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
import { bulkDeleteTickets } from '../selection/actions'

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

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const isCancelled = ticket.inventoryStatus === 'cancelled'
  const canChangeSeller = !isCancelled && ticket.inventoryStatus !== 'assigned'
  /**
   * BR-B05: eliminar es para una boleta cargada por error, que nunca entro a la
   * operacion. La base de datos lo vuelve a comprobar; esto solo evita ofrecer
   * un boton que iba a fallar.
   */
  const canDelete =
    ticket.clientId === null &&
    ticket.salePrice === null &&
    ticket.paidAmount === 0 &&
    (ticket.inventoryStatus === 'draft' ||
      ticket.inventoryStatus === 'pending_approval' ||
      ticket.inventoryStatus === 'available')

  function saveNumbers() {
    const parsed = updateTicketNumbersSchema.safeParse({
      ticketId: ticket.id,
      dailyNumber: daily,
      weeklyNumber: weekly,
    })
    if (!parsed.success) {
      setNumbersError(parsed.error.issues[0]?.message ?? 'Revisa los números.')
      return
    }
    setNumbersError(null)

    startTransition(async () => {
      const result = await updateTicketNumbers(parsed.data)
      if ('error' in result) {
        setNumbersError(result.error)
        return
      }
      toast.success('Números actualizados.')
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
        toast.success('Boleta aprobada. Ya está disponible para asignarse.')
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

  function confirmDelete() {
    if (deleteReason.trim().length < 5) {
      setDeleteError('Explica el motivo con al menos 5 caracteres.')
      return
    }
    setDeleteError(null)

    startTransition(async () => {
      const result = await bulkDeleteTickets({
        ticketIds: [ticket.id],
        reason: deleteReason,
      })
      if ('error' in result) {
        setDeleteError(result.error)
        return
      }
      toast.success('Boleta eliminada.')
      setDeleteOpen(false)
      router.push('/owner/tickets')
    })
  }

  return (
    <>
      {ticket.inventoryStatus === 'pending_approval' ? (
        <CompactActionSlot>
          <Button type="button" onClick={approve} disabled={isPending}>
            <CheckIcon className="size-4" aria-hidden />
            Aprobar boleta
          </Button>
        </CompactActionSlot>
      ) : null}

      {!isCancelled ? (
        <Button type="button" variant="outline" onClick={() => setNumbersOpen(true)}>
          Editar números
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

      {canDelete ? (
        <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)}>
          Eliminar boleta
        </Button>
      ) : null}

      <Dialog open={numbersOpen} onOpenChange={setNumbersOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar números</DialogTitle>
            <DialogDescription>
              Entre 1 y 4 dígitos. Los ceros iniciales importan: 007 no es lo mismo que 7.
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
              <Label htmlFor="daily-number">Número diario</Label>
              <TicketNumberInput id="daily-number" value={daily} onChange={setDaily} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weekly-number">Número semanal</Label>
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
        description="La boleta deja de ser utilizable y su combinación de números no podrá reutilizarse en esta rifa. Es una acción definitiva."
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
            placeholder="Explica por qué se anula esta boleta"
          />
          {cancelError ? (
            <p role="alert" className="text-destructive text-sm">
              {cancelError}
            </p>
          ) : null}
        </div>
      </ConfirmDialog>

      {/* Eliminar no es anular: borra una boleta que nunca debio existir y
          libera sus numeros. Por eso el texto insiste en la diferencia antes de
          confirmar (seccion 25 del encargo, BR-B05). */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) setDeleteError(null)
        }}
        title="Eliminar boleta"
        description="Esta boleta se borra para siempre y sus números quedan libres otra vez. Úsalo solo si se cargó por error; si ya salió a la calle, anúlala."
        confirmLabel="Eliminar boleta"
        destructive
        pending={isPending}
        onConfirm={confirmDelete}
      >
        <div className="space-y-1.5">
          <Label htmlFor="delete-reason">Motivo (obligatorio)</Label>
          <Textarea
            id="delete-reason"
            rows={3}
            value={deleteReason}
            onChange={(event) => setDeleteReason(event.target.value)}
            placeholder="Explica por qué se elimina esta boleta"
          />
          <p className="text-muted-foreground text-xs">
            Queda registrado quién la eliminó, cuándo, qué números tenía y por qué.
          </p>
          {deleteError ? (
            <p role="alert" className="text-destructive text-sm">
              {deleteError}
            </p>
          ) : null}
        </div>
      </ConfirmDialog>
    </>
  )
}
