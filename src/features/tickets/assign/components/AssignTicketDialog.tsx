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
import {
  ClientCreatedDialog,
  type ClientCreatedOutcome,
} from '@/features/whatsapp/components/ClientCreatedDialog'
import type { WhatsappSettings } from '@/features/whatsapp/invite'

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
  /** Configuracion de WhatsApp del vendedor (D-176). Sin ella no se ofrece
   *  invitar: es lo que ocurre en el portal administrativo. */
  whatsappSettings?: WhatsappSettings
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
  whatsappSettings,
}: AssignTicketDialogProps) {
  const [open, setOpen] = useState(false)
  /**
   * El cliente recien creado, si la venta se hizo con la pestaña «Cliente
   * nuevo». Vive AQUI y no dentro del formulario porque el formulario se
   * desmonta al cerrarse este dialogo, y con el se iria el de exito.
   */
  const [created, setCreated] = useState<ClientCreatedOutcome | null>(null)

  return (
    <>
      {/* En el telefono ocupa el ancho y mide 44 px de alto: es la accion
          principal de la pantalla y se pulsa con el dedo (D-085). */}
      <Button type="button" size="touch" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
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
            // Aqui SI se nombra la boleta: es una sola y ya la tenemos escrita.
            ticketLabel={ticketNumbers}
            onClientCreated={whatsappSettings ? setCreated : undefined}
          />
        </DialogContent>
      </Dialog>

      {whatsappSettings ? (
        <ClientCreatedDialog
          outcome={created}
          settings={whatsappSettings}
          // No se navega a ninguna parte: ya estamos en el detalle de la boleta,
          // que es donde se ve el resultado de la venta. `router.refresh()` lo
          // hizo el formulario.
          onClose={() => setCreated(null)}
        />
      ) : null}
    </>
  )
}
