'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ClientOption } from '@/features/clients/queries'
import { formatCOP } from '@/lib/money'

import { AssignTicketsForm } from './AssignTicketsForm'

type AssignTicketDialogProps = {
  ticketId: string
  /** Los dos numeros, ya formateados: «1234 / 5678» (BR-N11). */
  ticketNumbers: string
  /** Precio VIGENTE de la rifa: es el que quedara congelado en la boleta. */
  rafflePrice: number
  clients: ClientOption[]
}

/**
 * Asignar UNA boleta desde su detalle (CLAUDE.md 17).
 *
 * Es el mismo formulario que usa la venta de varias boletas a la vez, con una
 * sola en la lista: no hay dos caminos de asignacion (seccion 29 del encargo).
 * Lo unico propio de esta pantalla es el boton que abre el dialogo y el titulo,
 * que aqui puede nombrar la boleta concreta.
 */
export function AssignTicketDialog({
  ticketId,
  ticketNumbers,
  rafflePrice,
  clients,
}: AssignTicketDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Asignar a un cliente
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Asignar la boleta {ticketNumbers}</DialogTitle>
            <DialogDescription>
              Se registrará la venta por {formatCOP(rafflePrice)}, el precio vigente de la rifa. Ese
              valor queda fijo aunque la rifa cambie de precio después.
            </DialogDescription>
          </DialogHeader>

          <AssignTicketsForm
            ticketIds={[ticketId]}
            totalAmount={rafflePrice}
            clients={clients}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
