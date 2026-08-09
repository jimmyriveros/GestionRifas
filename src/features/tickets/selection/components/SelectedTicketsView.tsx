'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { EmptyState } from '@/components/data/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { TicketsTable } from '@/features/tickets/components/TicketsTable'
import type { TicketListItem } from '@/features/tickets/queries'

import { getSelectedTickets } from '../actions'
import { useTicketSelection } from '../TicketSelectionContext'

/**
 * «Ver seleccionadas» (seccion 10 del encargo).
 *
 * En vez de subir las boletas marcadas al principio de la lista —que mueve las
 * filas bajo el dedo y provoca toques equivocados (seccion 9)—, la lista se
 * cambia entera y temporalmente por las seleccionadas. Se pueden revisar, quitar
 * alguna, y volver.
 *
 * LOS FILTROS NO SE TOCAN. Viven en la URL y esta vista no los cambia: al
 * volver, la busqueda sigue tal cual estaba.
 */
export function TicketListSlot({
  basePath,
  showSeller,
  children,
}: {
  basePath: string
  showSeller: boolean
  /** La lista normal, ya renderizada en el servidor. */
  children: ReactNode
}) {
  const selection = useTicketSelection()

  if (!selection.viewingSelected) return <>{children}</>

  return <SelectedTickets basePath={basePath} showSeller={showSeller} />
}

type Loaded = { key: string; rows: TicketListItem[]; error: string | null }

function SelectedTickets({ basePath, showSeller }: { basePath: string; showSeller: boolean }) {
  const selection = useTicketSelection()
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  const idsKey = selection.selectedIds.join(',')
  const setVisibleIds = selection.setVisibleIds

  // Igual que en el contexto: el resultado se guarda junto con la lista de ids
  // que lo produjo, asi «esta al dia» se deduce en vez de guardarse aparte.
  const current = loaded && loaded.key === idsKey ? loaded : null

  useEffect(() => {
    if (idsKey === '') {
      return
    }

    let live = true
    void getSelectedTickets({ ticketIds: idsKey.split(',') }).then((result) => {
      if (!live) return
      if ('error' in result) {
        setLoaded({ key: idsKey, rows: [], error: result.error })
        return
      }
      setLoaded({ key: idsKey, rows: result.data, error: null })
      // La casilla del encabezado debe referirse a lo que se ve aqui, no a la
      // pagina de resultados que quedo detras.
      setVisibleIds(result.data.map((ticket) => ticket.id))
    })

    return () => {
      live = false
    }
  }, [idsKey, setVisibleIds])

  // Al volver a los resultados, la casilla del encabezado vuelve a hablar de la
  // pagina. Solo limpieza: nada que ejecutar al montar.
  useEffect(() => () => setVisibleIds(null), [setVisibleIds])

  const tickets = idsKey === '' ? [] : (current?.rows ?? null)
  const error = current?.error ?? null

  if (error) {
    return (
      <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
        {error}
      </p>
    )
  }

  if (tickets === null) {
    return (
      <div className="space-y-2 rounded-lg border p-4" aria-busy="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    )
  }

  if (tickets.length === 0) {
    return (
      <EmptyState
        title="No hay boletas seleccionadas"
        description="Vuelve a los resultados y marca las boletas con las que quieras trabajar."
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Estás viendo solo las boletas seleccionadas. Tus filtros siguen guardados.
      </p>
      <TicketsTable tickets={tickets} basePath={basePath} showSeller={showSeller} />
    </div>
  )
}
