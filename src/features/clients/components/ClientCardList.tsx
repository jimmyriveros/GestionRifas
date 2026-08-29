'use client'

import { useRouter } from 'next/navigation'
import type { KeyboardEvent, MouseEvent } from 'react'

import { RowChevron } from '@/components/data/RowChevron'
import { RowLink } from '@/components/data/RowLink'
import {
  hasTextSelection,
  isActivationKey,
  shouldActivateRow,
} from '@/components/data/row-activation'
import { CLIENT_STATUS_LABELS } from '@/lib/constants'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import type { ClientListItem } from '../queries'

/**
 * La lista de clientes TAL COMO SE VE EN UN TELEFONO (D-136).
 *
 * Es la otra cara de `ClientsTable`, no otra pantalla: las dos reciben las
 * MISMAS filas —`ClientListItem[]`, ya consultadas y paginadas en el servidor—
 * y aqui no hay consulta, ni efecto, ni estado propio. Si algo se ve en la
 * tarjeta es porque el listado ya lo traia.
 *
 * POR QUE NO UNA TABLA ENCOGIDA. La tabla resolvia el ancho ocultando columnas
 * (`hideOnMobile`), y aun asi Cliente · Telefono · Boletas · Saldo no caben
 * en 320 px: empujan un scroll horizontal. La informacion se reparte a lo alto
 * en vez de a lo ancho, igual que `TicketCardList` (D-107).
 *
 * DOS PIEZAS: CUERPO Y PIE.
 *
 *   1. El CUERPO identifica a la persona: el nombre a la izquierda —y el alias
 *      debajo, solo cuando lo tiene— y el celular a la derecha. La flecha dice
 *      que el registro se abre. El vendedor y «Archivado» son datos que la
 *      tabla ya tenia; se quedan en gris y solo aparecen cuando aplican.
 *
 *   2. El PIE dice cuanto le queda: boletas y saldo, separados por una linea
 *      del cuerpo. Los valores pesan mas que sus rotulos.
 *
 * Cada cliente es una tarjeta con su borde, separada de la siguiente —no una
 * fila mas de una lista continua—. Caben menos por pantalla que las boletas,
 * y el diseño aprobado pide ese aire.
 *
 * COMPORTAMIENTO IDENTICO AL DE LA FILA. Toda la tarjeta abre el detalle, no
 * solo el nombre o la flecha. Se reutilizan las reglas de `row-activation`,
 * las mismas que ya aplica `DataTable`. El enlace del nombre se conserva: da
 * el menu contextual, «abrir en otra pestana» y una parada de teclado con
 * nombre.
 */

type ClientCardListProps = {
  clients: ClientListItem[]
  /** `/owner/clients` o `/seller/clients`: la lista sirve a los dos portales. */
  basePath: string
  /** El vendedor no necesita el nombre del vendedor: todos los clientes son suyos. */
  showSeller?: boolean
}

export function ClientCardList({ clients, basePath, showSeller = false }: ClientCardListProps) {
  const router = useRouter()

  function activate(client: ClientListItem) {
    router.push(`${basePath}/${client.id}`)
  }

  function handleClick(event: MouseEvent<HTMLLIElement>, client: ClientListItem) {
    if (!shouldActivateRow(event.target, event.currentTarget)) return
    if (hasTextSelection(window.getSelection())) return
    activate(client)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>, client: ClientListItem) {
    if (event.target !== event.currentTarget) return
    if (!isActivationKey(event.key)) return
    event.preventDefault() // `Space` desplazaria la pagina.
    activate(client)
  }

  return (
    <ul aria-label="Clientes" className="space-y-2">
      {clients.map((client) => {
        const href = `${basePath}/${client.id}`

        return (
          <li
            key={client.id}
            tabIndex={0}
            className={cn(
              'bg-card min-w-0 rounded-lg border transition-colors',
              'hover:bg-muted/50 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
            )}
            onClick={(event) => handleClick(event, client)}
            onKeyDown={(event) => handleKeyDown(event, client)}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              {/* min-w-0 para que un nombre largo baje de linea en vez de
                  empujar el celular fuera de la tarjeta (D-125). */}
              <div className="min-w-0 flex-1">
                <RowLink href={href} className="font-semibold break-words">
                  {client.name}
                </RowLink>
                {client.alias ? (
                  <p className="text-muted-foreground text-xs break-words">{client.alias}</p>
                ) : null}
                {showSeller ? (
                  <p className="text-muted-foreground truncate text-xs">{client.sellerName}</p>
                ) : null}
                {client.archivedAt ? (
                  <p className="text-muted-foreground text-xs">{CLIENT_STATUS_LABELS.archived}</p>
                ) : null}
              </div>

              <div className="flex max-w-[45%] shrink-0 items-start gap-1.5">
                {client.phone ? (
                  <span className="text-muted-foreground text-right text-sm break-all tabular-nums">
                    {client.phone}
                  </span>
                ) : null}
                <RowChevron className="mt-0.5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t px-4 py-2.5">
              <Stat label="Boletas" value={String(client.ticketsCount)} />
              <Stat label="Saldo" value={formatCOP(client.pendingAmount)} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs leading-tight">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}
