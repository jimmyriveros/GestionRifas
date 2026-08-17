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

import { AssignTicketsForm } from './AssignTicketsForm'

type AssignTicketDialogProps = {
  ticketId: string
  /** Los dos numeros, ya formateados: «1234 / 5678» (BR-N11). */
  ticketNumbers: string
  /** Precio VIGENTE de la rifa: el que llega precargado en el formulario. */
  rafflePrice: number
  /** Lo mas barato que se puede vender esta boleta (BR-P11). Lo calcula SQL a
   *  partir de la forma de pago de su vendedor. */
  minSalePrice: number
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
  minSalePrice,
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
            {/* La cifra ya no se nombra aqui: la escribe el formulario, y
                repetirla arriba dejaria un numero desactualizado en cuanto
                alguien rebajara el precio. */}
            <DialogDescription>
              Elige el cliente que la compró. El precio que registres queda fijo aunque la rifa
              cambie de precio después.
            </DialogDescription>
          </DialogHeader>

          <AssignTicketsForm
            ticketIds={[ticketId]}
            totalAmount={rafflePrice}
            clients={clients}
            priceRange={{ basePrice: rafflePrice, minSalePrice }}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
