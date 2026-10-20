'use client'

import { CheckIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
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

import { assignInventoryTickets, recoverInventoryTickets } from '@/features/inventory/actions'
import { INVENTORY_COPY } from '@/features/inventory/copy'
import type { TicketCustody } from '@/features/inventory/rules'
import type { TicketInventoryStatus } from '@/lib/constants'
import { ticketNumbersProblem, type RaffleNumberFormat } from '@/lib/ticket-number-format'

import { approveTickets, cancelTicket, reassignTicketSeller, updateTicketNumbers } from '../actions'
import { cancelTicketSchema, updateTicketNumbersSchema } from '../schemas'
import { bulkDeleteTickets } from '../selection/actions'
import { TicketNumberFields, ticketNumbersHelp } from './TicketNumberFields'

/**
 * Lo UNICO que estas acciones necesitan de la boleta (D-198). Es un componente
 * cliente: lo que se le pase viaja al navegador, asi que no recibe el detalle
 * entero.
 */
export type TicketActionsTicket = {
  id: string
  dailyNumber: string | null
  weeklyNumber: string | null
  inventoryStatus: TicketInventoryStatus
  /** `null` en el inventario comun (D-257). */
  sellerId: string | null
  /** Quien la tiene: decide que acciones de inventario se ofrecen (D-257). */
  custody: TicketCustody
  /** D-261: cuantos numeros pide la boleta y con cuantas cifras. */
  numberFormat?: RaffleNumberFormat
}

type TicketActionsProps = {
  ticket: TicketActionsTicket
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
  const [sellerId, setSellerId] = useState(ticket.sellerId ?? '')

  const [recoverOpen, setRecoverOpen] = useState(false)
  const [recoverError, setRecoverError] = useState<string | null>(null)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const isCancelled = ticket.inventoryStatus === 'cancelled'
  /**
   * Las tres acciones de inventario comparten el mismo conjunto: una boleta que
   * todavia no se vendio ni se anulo. La base de datos lo vuelve a comprobar
   * todo; esto solo evita ofrecer un boton que iba a fallar.
   *
   *   * Cambiar vendedor: una vendida arrastra a su cliente (BR-C05).
   *   * Anular: una vendida ya no la anula el personal, porque el rechazo por
   *     abonos delataria una Abonada detras de «Sin pagar» (D-198, BR-Q07).
   *   * Eliminar: solo lo que nunca entro a la operacion (BR-B05).
   */
  const isUnsold =
    ticket.inventoryStatus === 'draft' ||
    ticket.inventoryStatus === 'pending_approval' ||
    ticket.inventoryStatus === 'available'
  /**
   * D-257. Una APARTADA no se toca hasta que la vendan, la devuelvan o venza
   * (BR-I23): ninguna accion de inventario se ofrece. Una del inventario comun
   * no «cambia» de vendedor, se ASIGNA a uno; y una disponible con vendedor se
   * puede RECUPERAR al inventario comun.
   */
  const held = ticket.custody === 'held'
  const common = ticket.custody === 'common'
  const canChangeSeller = isUnsold && ticket.custody === 'seller'
  const canAssignToSeller = common && ticket.inventoryStatus === 'available'
  const canRecover = ticket.custody === 'seller' && ticket.inventoryStatus === 'available'
  const canCancel = isUnsold && !held
  const canDelete = isUnsold && !held

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
    // D-261: las cifras exactas de la rifa, con la frase de la base.
    if (ticket.numberFormat) {
      const problem = ticketNumbersProblem(ticket.numberFormat, daily, weekly || null, true)
      if (problem) {
        setNumbersError(problem)
        return
      }
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
      if (common) {
        const assigned = await assignInventoryTickets({ ticketIds: [ticket.id], sellerId })
        if ('error' in assigned) {
          toast.error(assigned.error)
          return
        }
        toast.success(assigned.data.message)
        setSellerOpen(false)
        router.refresh()
        return
      }
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

  function confirmRecover() {
    setRecoverError(null)
    startTransition(async () => {
      const result = await recoverInventoryTickets({ ticketIds: [ticket.id] })
      if ('error' in result) {
        setRecoverError(result.error)
        return
      }
      toast.success(result.data.message)
      setRecoverOpen(false)
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
      {/* 44 PX EN EL TELEFONO Y FILAS PAREJAS (D-234). Con `grow`, las acciones
          se reparten cada fila de lado a lado en vez de quedar en tiras de
          anchos sueltos; desde `sm` recuperan su ancho y su alto de siempre. Es
          la misma receta de la cabecera de «Boletas» (D-109), pedida por los
          botones y no por el encabezado que comparten 27 pantallas. La
          cabecera compacta la anula al subir «Aprobar boleta» (D-150). */}
      {ticket.inventoryStatus === 'pending_approval' ? (
        <CompactActionSlot>
          <Button
            type="button"
            size="touch"
            className="grow sm:grow-0"
            onClick={approve}
            disabled={isPending}
          >
            <CheckIcon className="size-4" aria-hidden />
            Aprobar boleta
          </Button>
        </CompactActionSlot>
      ) : null}

      {!isCancelled && !held ? (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="grow sm:grow-0"
          onClick={() => setNumbersOpen(true)}
        >
          Editar números
        </Button>
      ) : null}

      {canAssignToSeller ? (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="grow sm:grow-0"
          onClick={() => setSellerOpen(true)}
        >
          {INVENTORY_COPY.staff.assignAction}
        </Button>
      ) : null}

      {canRecover ? (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="grow sm:grow-0"
          onClick={() => setRecoverOpen(true)}
        >
          {INVENTORY_COPY.staff.recoverAction}
        </Button>
      ) : null}

      {canChangeSeller ? (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="grow sm:grow-0"
          onClick={() => setSellerOpen(true)}
        >
          Cambiar vendedor
        </Button>
      ) : null}

      {canCancel ? (
        <Button
          type="button"
          variant="destructive"
          size="touch"
          className="grow sm:grow-0"
          onClick={() => setCancelOpen(true)}
        >
          Anular boleta
        </Button>
      ) : null}

      {canDelete ? (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="grow sm:grow-0"
          onClick={() => setDeleteOpen(true)}
        >
          Eliminar boleta
        </Button>
      ) : null}

      <Dialog open={numbersOpen} onOpenChange={setNumbersOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar números</DialogTitle>
            <DialogDescription>{ticketNumbersHelp(ticket.numberFormat)}</DialogDescription>
          </DialogHeader>

          {numbersError ? (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
            >
              {numbersError}
            </p>
          ) : null}

          <TicketNumberFields
            format={ticket.numberFormat}
            values={{ daily, weekly }}
            onChange={(slot, value) => (slot === 'daily_number' ? setDaily(value) : setWeekly(value))}
            idPrefix="ticket-number"
          />

          <DialogFooter>
            <Button
              size="touch"
              variant="outline"
              onClick={() => setNumbersOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button size="touch" onClick={saveNumbers} disabled={isPending}>
              {isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sellerOpen} onOpenChange={setSellerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {common ? INVENTORY_COPY.staff.assignTitle : 'Cambiar vendedor'}
            </DialogTitle>
            <DialogDescription>
              {common
                ? INVENTORY_COPY.staff.assignDescription
                : 'Solo es posible mientras la boleta no este asignada a un cliente.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-seller">Vendedor</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger id="ticket-seller" className="w-full">
                <SelectValue placeholder={INVENTORY_COPY.staff.assignSellerPlaceholder} />
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
            <Button
              size="touch"
              variant="outline"
              onClick={() => setSellerOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              size="touch"
              onClick={saveSeller}
              disabled={isPending || sellerId === '' || sellerId === ticket.sellerId}
            >
              {isPending
                ? 'Guardando...'
                : common
                  ? INVENTORY_COPY.staff.assignConfirm(1)
                  : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={recoverOpen}
        onOpenChange={(open) => {
          setRecoverOpen(open)
          if (!open) setRecoverError(null)
        }}
        title={INVENTORY_COPY.staff.recoverTitle}
        description={INVENTORY_COPY.staff.recoverDescription}
        confirmLabel={INVENTORY_COPY.staff.recoverConfirm(1)}
        pending={isPending}
        onConfirm={confirmRecover}
      >
        {recoverError ? (
          <p role="alert" className="text-destructive text-sm">
            {recoverError}
          </p>
        ) : null}
      </ConfirmDialog>

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
