'use client'

import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { TourOverlay } from '@/features/tour/components/TourOverlay'
import { hasSeenTour, markTourSeen } from '@/features/tour/storage'
import { findTour, type Tour } from '@/features/tour/tours'
import { useTourRunner, waitForTour } from '@/features/tour/use-tour'
import type { AppRole } from '@/lib/constants'

/**
 * Conecta la pantalla actual con su recorrido: decide cual corre segun la ruta
 * y el rol, lo arranca la primera vez y recuerda que ya se vio.
 */

type TourControls = {
  /** Hay recorrido para esta pantalla y este rol. */
  isAvailable: boolean
  /** Vuelve a mostrarlo aunque ya se haya visto. */
  restart: () => void
}

const TourContext = createContext<TourControls>({ isAvailable: false, restart: () => {} })

export function useTourControls() {
  return useContext(TourContext)
}

type TourProviderProps = {
  role: AppRole
  /** Separa la memoria por persona: dos usuarios en el mismo equipo no se heredan el recorrido. */
  profileId: string
  children: ReactNode
}

export function TourProvider({ role, profileId, children }: TourProviderProps) {
  const pathname = usePathname()
  const tour = useMemo(() => findTour(pathname, role), [pathname, role])
  const [activeTour, setActiveTour] = useState<Tour | null>(null)

  // Arranque automatico. `waitForTour` espera a que la pantalla termine de
  // llegar: al montar, lo que hay en el DOM todavia es el esqueleto de carga.
  useEffect(() => {
    if (!tour || hasSeenTour(profileId, tour.id)) return

    let cancelled = false
    void waitForTour(tour).then((ready) => {
      if (ready && !cancelled) setActiveTour(tour)
    })
    return () => {
      cancelled = true
    }
  }, [tour, profileId])

  // Cambiar de pantalla cierra lo que estuviera abierto: el recorrido siempre
  // habla de lo que se esta viendo. Se deduce de la ruta en vez de apagarse
  // desde un efecto, para que el cambio sea inmediato y no cueste un render de
  // mas.
  const runningTour = activeTour && activeTour.path === pathname ? activeTour : null

  const restart = useCallback(() => {
    if (!tour) return
    setActiveTour(null)
    void waitForTour(tour).then((ready) => {
      if (ready) setActiveTour(tour)
    })
  }, [tour])

  const handleClose = useCallback(
    (closed: Tour) => {
      markTourSeen(profileId, closed.id)
      setActiveTour(null)
    },
    [profileId],
  )

  const controls = useMemo<TourControls>(
    () => ({ isAvailable: tour !== null, restart }),
    [tour, restart],
  )

  return (
    <TourContext.Provider value={controls}>
      {children}
      {/* `key` reinicia el contador de pasos al cambiar de recorrido, sin un efecto que lo haga. */}
      {runningTour ? (
        <TourRunner key={runningTour.id} tour={runningTour} onClose={handleClose} />
      ) : null}
    </TourContext.Provider>
  )
}

/**
 * Une la logica con la presentacion. Separado del proveedor para que el hook se
 * monte solo mientras hay un recorrido corriendo: sin recorrido no hay bucle de
 * medicion ni escuchas de teclado.
 */
function TourRunner({ tour, onClose }: { tour: Tour; onClose: (tour: Tour) => void }) {
  const runner = useTourRunner({ tour, onClose })

  if (!runner.step) return null

  return (
    <TourOverlay
      step={runner.step}
      index={runner.index}
      total={runner.total}
      isFirst={runner.isFirst}
      isLast={runner.isLast}
      rect={runner.rect}
      onNext={runner.next}
      onPrevious={runner.previous}
      onClose={runner.close}
    />
  )
}
