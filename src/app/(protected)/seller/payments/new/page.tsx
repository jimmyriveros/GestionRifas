import { CheckIcon } from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/data/EmptyState'
import { PageHeader } from '@/components/data/PageHeader'
import { Button } from '@/components/ui/button'
import { getClientDetail } from '@/features/clients/queries'
import { ClientPicker } from '@/features/payments/components/ClientPicker'
import { PaymentClientBanner } from '@/features/payments/components/PaymentClientBanner'
import { PaymentForm } from '@/features/payments/components/PaymentForm'
import { listClientsWithBalance, listPayableTickets } from '@/features/payments/queries'
import { parsePaymentOrigin, paymentNewHref, paymentReturnTo } from '@/features/payments/return-to'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first === '' ? undefined : first
}

export default async function NewPaymentPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const clientId = single(params.clientId)
  // De que boleta viene el vendedor, si es que viene de una. Sirve para el
  // reparto y, si no hay `from`, para devolverlo ahi (D-133).
  const fromTicketId = single(params.ticketId)
  const from = single(params.from)
  const origin = parsePaymentOrigin(from)
  const pickerHref = paymentNewHref({ from: origin })
  const fallbackHref = paymentReturnTo({
    from,
    fromTicketId,
    payableTicketIds: [],
  }).href

  if (!clientId) {
    const clients = await listClientsWithBalance()

    return (
      <div className="space-y-6">
        <PageHeader
          title="Registrar abono"
          description="Elige el cliente que te pago. Solo aparecen los que tienen saldo pendiente."
          backHref={fallbackHref}
        />
        {clients.length === 0 ? (
          <EmptyState
            icon={<CheckIcon className="size-8" aria-hidden />}
            title="Nadie te debe dinero"
            description="Todas tus boletas vendidas están pagadas. Cuando asignes una nueva, aparecerá aquí."
            action={
              <Button asChild variant="outline">
                <Link href="/seller/tickets?inventoryStatus=available">
                  Ver boletas disponibles
                </Link>
              </Button>
            }
          />
        ) : (
          <ClientPicker clients={clients} />
        )}
      </div>
    )
  }

  // RLS: si el cliente es de otro vendedor, no existe para quien consulta.
  const [client, tickets] = await Promise.all([
    getClientDetail(clientId),
    listPayableTickets(clientId),
  ])

  if (!client) {
    return (
      <div className="space-y-6">
        <PageHeader title="Registrar abono" backHref={fallbackHref} />
        <EmptyState
          title="Cliente no encontrado"
          description="Ese cliente no existe o no está en tu cartera."
          action={
            <Button asChild variant="outline">
              <Link href={pickerHref}>Elegir otro cliente</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (tickets.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Registrar abono" backHref={fallbackHref} />
        <EmptyState
          icon={<CheckIcon className="size-8" aria-hidden />}
          title={`${client.name} no tiene saldo pendiente`}
          description="Todas sus boletas están pagadas."
          action={
            <Button asChild variant="outline">
              <Link href={pickerHref}>Elegir otro cliente</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const { originTicketId, href: returnTo } = paymentReturnTo({
    from,
    fromTicketId,
    // El id sale de la fila que RLS ya dejo ver, no del parametro crudo.
    clientId: client.id,
    payableTicketIds: tickets.map((ticket) => ticket.ticketId),
  })

  return (
    <div className="grid min-h-[calc(100svh-5.5rem-var(--bottom-nav-space))] grid-rows-[auto_auto_1fr] gap-6 md:flex md:min-h-0 md:flex-col">
      {/*
        5.5rem = header 3.5 + el p-4 de main (1 rem arriba y 1 rem del fondo
        que no es la barra). --bottom-nav-space cubre la navegacion inferior.
        La fila `1fr` estira el formulario y `mt-auto` deja los botones al
        fondo cuando hay pocas boletas (D-138). `min-height` en un flex anidado
        no reparte ese hueco: la rejilla si.
      */}
      <PageHeader title="Registrar abono" backHref={returnTo} />
      <div className="space-y-2">
        <PaymentClientBanner name={client.name} changeHref={pickerHref} />
        <p className="text-muted-foreground text-sm">El abono se reparte entre sus boletas.</p>
      </div>
      <PaymentForm
        className="h-full min-h-0"
        clientId={client.id}
        clientName={client.name}
        tickets={tickets}
        returnTo={returnTo}
        originTicketId={originTicketId}
      />
    </div>
  )
}
