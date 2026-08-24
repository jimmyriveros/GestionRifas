'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import { BULK_SELECTION_MAX } from '@/lib/constants'
import { useIsCompactScreen } from '@/lib/use-media-query'

import { getTicketSelectionEligibility } from './actions'
import type { TicketEligibility } from './eligibility'
import {
  emptySelection,
  readSelection,
  subscribeSelection,
  writeSelection,
} from './selection-store'

/**
 * El estado de la seleccion multiple de boletas (BR-B01, D-082).
 *
 * QUE SE GUARDA: identificadores, nada mas (seccion 18 del encargo). Ni
 * posiciones, ni indices de fila, ni copias de las boletas: los filtros y el
 * orden mueven las filas de sitio, y una seleccion basada en posiciones
 * seleccionaria otra cosa en cuanto la lista cambiara.
 *
 * DONDE SE GUARDA: en `selection-store.ts`, fuera de React, para que buscar,
 * filtrar o recargar no la borre (seccion 11).
 *
 * LIMPIAR FILTROS NO ES LIMPIAR SELECCION (seccion 12). Son dos botones
 * distintos y ninguno toca lo del otro: los filtros estan en la URL y la
 * seleccion en ese almacen.
 *
 * MODO SELECCION. En pantallas pequenas la seleccion es un modo explicito: se
 * entra con «Seleccionar varias», aparecen las casillas y tocar cualquier parte
 * libre de la fila la marca. En escritorio no hace falta modo: la columna de
 * casillas esta siempre y la fila sigue abriendo el detalle.
 */

/** Pausa antes de preguntar por la elegibilidad: marcar quince casillas seguidas
 *  debe costar una consulta, no quince. */
const ELIGIBILITY_DEBOUNCE_MS = 400

export type TicketSelectionContextValue = {
  /** Ids seleccionados, en el orden en que se fueron marcando. */
  selectedIds: string[]
  selectedCount: number
  isSelected: (ticketId: string) => boolean
  toggle: (ticketId: string) => void
  setSelected: (ticketId: string, selected: boolean) => void
  addMany: (ticketIds: readonly string[]) => void
  clear: () => void
  atLimit: boolean

  /** Ids de la lista que se esta viendo, para la casilla del encabezado. */
  pageIds: readonly string[]
  pageAllSelected: boolean
  pageSomeSelected: boolean
  togglePage: (selected: boolean) => void

  /** Pantalla pequena: la fila entera es la diana. */
  compact: boolean
  selectionMode: boolean
  /** `true` cuando tocar una fila debe marcarla en vez de abrir su detalle. */
  rowClickSelects: boolean
  startSelectionMode: (firstTicketId?: string) => void
  exitSelectionMode: () => void

  /** «Ver seleccionadas»: la lista muestra solo lo marcado, sin tocar filtros. */
  viewingSelected: boolean
  setViewingSelected: (value: boolean) => void
  /** Ids que la lista esta mostrando ahora, cuando no son los de la pagina. */
  setVisibleIds: (ticketIds: string[] | null) => void

  /** Que admite cada boleta seleccionada. `null` mientras se consulta. */
  eligibility: TicketEligibility[] | null
  eligibilityLoading: boolean
  /** Boletas seleccionadas que ya no existen o dejaron de ser visibles. */
  missingCount: number
  refreshEligibility: () => void
}

const TicketSelectionContext = createContext<TicketSelectionContextValue | null>(null)

export function useTicketSelection(): TicketSelectionContextValue {
  const value = useContext(TicketSelectionContext)
  if (!value) {
    throw new Error('useTicketSelection debe usarse dentro de <TicketSelectionProvider>')
  }
  return value
}

/** Igual, pero sin reventar fuera del proveedor: lo usan las tablas compartidas
 *  que tambien sirven a pantallas sin seleccion multiple. */
export function useOptionalTicketSelection(): TicketSelectionContextValue | null {
  return useContext(TicketSelectionContext)
}

type EligibilityCache = { key: string; rows: TicketEligibility[] }

export function TicketSelectionProvider({
  storageKey,
  pageIds: resultIds,
  children,
}: {
  /** Separa la seleccion del portal administrativo de la del vendedor. */
  storageKey: string
  pageIds: readonly string[]
  children: ReactNode
}) {
  const selectedIds = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribeSelection(storageKey, onChange), [storageKey]),
    useCallback(() => readSelection(storageKey), [storageKey]),
    emptySelection,
  )

  // El modo solo existe en pantallas pequenas. Se DEDUCE en vez de apagarse
  // desde un efecto al ensanchar la ventana: asi el cambio es inmediato y no
  // cuesta un render de mas (mismo criterio que TourProvider).
  const [selectionModeRequested, setSelectionModeRequested] = useState(false)
  const compact = useIsCompactScreen()
  const selectionMode = compact && selectionModeRequested

  const [viewingSelected, setViewingSelected] = useState(false)
  // Mientras se revisan las seleccionadas, la lista visible no es la pagina de
  // resultados: la casilla del encabezado tiene que referirse a lo que se ve.
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null)
  const pageIds = visibleIds ?? resultIds

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const isSelected = useCallback((ticketId: string) => selectedSet.has(ticketId), [selectedSet])

  const update = useCallback(
    (next: (current: string[]) => string[]) => {
      const current = readSelection(storageKey)
      const value = next(current)
      if (value !== current) writeSelection(storageKey, value)
    },
    [storageKey],
  )

  const setSelected = useCallback(
    (ticketId: string, selected: boolean) => {
      update((current) => {
        const has = current.includes(ticketId)
        if (selected === has) return current
        if (!selected) return current.filter((id) => id !== ticketId)
        if (current.length >= BULK_SELECTION_MAX) return current
        return [...current, ticketId]
      })
    },
    [update],
  )

  const toggle = useCallback(
    (ticketId: string) => {
      update((current) =>
        current.includes(ticketId)
          ? current.filter((id) => id !== ticketId)
          : current.length >= BULK_SELECTION_MAX
            ? current
            : [...current, ticketId],
      )
    },
    [update],
  )

  const addMany = useCallback(
    (ticketIds: readonly string[]) => {
      update((current) => {
        const seen = new Set(current)
        const next = [...current]
        for (const id of ticketIds) {
          if (seen.has(id) || next.length >= BULK_SELECTION_MAX) continue
          seen.add(id)
          next.push(id)
        }
        return next.length === current.length ? current : next
      })
    },
    [update],
  )

  const clear = useCallback(() => {
    writeSelection(storageKey, [])
    setViewingSelected(false)
  }, [storageKey])

  const togglePage = useCallback(
    (selected: boolean) => {
      if (selected) {
        addMany(pageIds)
        return
      }
      const onPage = new Set(pageIds)
      update((current) => current.filter((id) => !onPage.has(id)))
    },
    [addMany, pageIds, update],
  )

  const startSelectionMode = useCallback(
    (firstTicketId?: string) => {
      setSelectionModeRequested(true)
      if (firstTicketId) setSelected(firstTicketId, true)
    },
    [setSelected],
  )

  const exitSelectionMode = useCallback(() => {
    setSelectionModeRequested(false)
    clear()
  }, [clear])

  // ---------------------------------------------------------------- elegibilidad
  //
  // Una sola consulta por pausa, no una por casilla. El testigo de secuencia
  // descarta las respuestas viejas: una Server Action no se puede abortar, asi
  // que la que llegue tarde no debe pisar a la que llego despues (D-078).
  //
  // El resultado se guarda junto con la lista de ids que lo produjo, de modo
  // que «esta al dia» y «se esta consultando» se DEDUCEN en vez de necesitar
  // otro estado que mantener sincronizado.
  const requestId = useRef(0)
  const [cached, setCached] = useState<EligibilityCache | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const refreshEligibility = useCallback(() => setRefreshToken((value) => value + 1), [])

  const idsKey = selectedIds.join(',')
  const eligibility = cached && cached.key === idsKey ? cached.rows : null
  const eligibilityLoading = selectedIds.length > 0 && eligibility === null

  useEffect(() => {
    if (idsKey === '') return

    const mine = ++requestId.current
    const ids = idsKey.split(',')
    const timer = setTimeout(() => {
      void getTicketSelectionEligibility({ ticketIds: ids }).then((result) => {
        if (mine !== requestId.current) return
        setCached({ key: idsKey, rows: 'error' in result ? [] : result.data })
      })
    }, ELIGIBILITY_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [idsKey, refreshToken])

  const value = useMemo<TicketSelectionContextValue>(() => {
    const pageSelected = pageIds.filter((id) => selectedSet.has(id)).length
    return {
      selectedIds,
      selectedCount: selectedIds.length,
      isSelected,
      toggle,
      setSelected,
      addMany,
      clear,
      atLimit: selectedIds.length >= BULK_SELECTION_MAX,
      pageIds,
      pageAllSelected: pageIds.length > 0 && pageSelected === pageIds.length,
      pageSomeSelected: pageSelected > 0 && pageSelected < pageIds.length,
      togglePage,
      compact,
      selectionMode,
      rowClickSelects: selectionMode,
      startSelectionMode,
      exitSelectionMode,
      viewingSelected,
      setViewingSelected,
      setVisibleIds,
      eligibility,
      eligibilityLoading,
      missingCount: eligibility === null ? 0 : Math.max(0, selectedIds.length - eligibility.length),
      refreshEligibility,
    }
  }, [
    addMany,
    clear,
    compact,
    eligibility,
    eligibilityLoading,
    exitSelectionMode,
    isSelected,
    pageIds,
    refreshEligibility,
    selectedIds,
    selectedSet,
    selectionMode,
    setSelected,
    startSelectionMode,
    toggle,
    togglePage,
    viewingSelected,
  ])

  return (
    <TicketSelectionContext.Provider value={value}>{children}</TicketSelectionContext.Provider>
  )
}
