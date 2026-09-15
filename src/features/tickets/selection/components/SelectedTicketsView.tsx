'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { EmptyState } from '@/components/data/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { TicketsList } from '@/features/tickets/components/TicketsList'

import { getSelectedTickets, type SelectedTicketsResult } from '../actions'
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
 *
 * EL MODELO LO DECIDE EL SERVIDOR (D-198). `getSelectedTickets` devuelve las
 * boletas del vendedor con su dinero, o las del personal con la proyeccion
 * administrativa, segun la sesion. Esta vista solo pinta lo que le llega.
 */
export function TicketListSlot({
  basePath,
  showSeller,
  showRaffle = true,
  children,
}: {
  basePath: string
  showSeller: boolean
  /** Debe coincidir con la lista de detras: es la misma pantalla (D-088). */
  showRaffle?: boolean
  /** La lista normal, ya renderizada en el servidor. */
  children: ReactNode
}) {
  const selection = useTicketSelection()

  if (!selection.viewingSelected) return <>{children}</>

  return <SelectedTickets basePath={basePath} showSeller={showSeller} showRaffle={showRaffle} />
}

type Loaded = { key: string; result: SelectedTicketsResult | null; error: string | null }

function SelectedTickets({
  basePath,
  showSeller,
  showRaffle,
}: {
  basePath: string
  showSeller: boolean
  showRaffle: boolean
}) {
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
    void getSelectedTickets({ ticketIds: idsKey.split(',') }).then((response) => {
      if (!live) return
      if ('error' in response) {
        setLoaded({ key: idsKey, result: null, error: response.error })
        return
      }
      setLoaded({ key: idsKey, result: response.data, error: null })
      // La casilla del encabezado debe referirse a lo que se ve aqui, no a la
      // pagina de resultados que quedo detras.
      setVisibleIds(response.data.rows.map((ticket) => ticket.id))
    })

    return () => {
      live = false
    }
  }, [idsKey, setVisibleIds])

  // Al volver a los resultados, la casilla del encabezado vuelve a hablar de la
  // pagina. Solo limpieza: nada que ejecutar al montar.
  useEffect(() => () => setVisibleIds(null), [setVisibleIds])

  const error = current?.error ?? null
  const result = idsKey === '' ? null : (current?.result ?? null)
  const count = idsKey === '' ? 0 : (result?.rows.length ?? null)

  if (error) {
    return (
      <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
        {error}
      </p>
    )
  }

  if (count === null) {
    // El hueco tiene la altura de lo que va a aparecer: una tarjeta en el
    // telefono, una fila en escritorio. Si no, la lista da un salto al llegar.
    return (
      <div className="space-y-2 rounded-lg border p-4" aria-busy="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full md:h-9" />
        ))}
      </div>
    )
  }

  if (count === 0 || result === null) {
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
      {result.audience === 'staff' ? (
        <TicketsList audience="staff" tickets={result.rows} basePath={basePath} />
      ) : (
        <TicketsList
          tickets={result.rows}
          basePath={basePath}
          showSeller={showSeller}
          showRaffle={showRaffle}
        />
      )}
    </div>
  )
}
