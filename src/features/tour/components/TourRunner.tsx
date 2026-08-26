'use client'

import { TourOverlay } from '@/features/tour/components/TourOverlay'
import type { Tour } from '@/features/tour/tours'
import { useTourRunner } from '@/features/tour/use-tour'

/**
 * Une la logica con la presentacion. Separado del proveedor para que el hook se
 * monte solo mientras hay un recorrido corriendo: sin recorrido no hay bucle de
 * medicion ni escuchas de teclado.
 *
 * VIVE EN SU PROPIO ARCHIVO desde el 2026-08-26 (D-120), y no dentro de
 * `TourProvider`, por una razon de peso y no de orden: el proveedor esta en el
 * armazon de los dos portales, o sea en TODAS las pantallas, mientras que esto
 * —el dibujo del globo y el bucle que mide donde esta cada elemento— solo hace
 * falta cuando alguien esta viendo el recorrido. Estando aqui, el proveedor lo
 * pide con `next/dynamic` y su codigo viaja en un fragmento aparte que la
 * mayoria de las visitas no llega a descargar.
 *
 * No cambia ni un paso ni un texto del recorrido: es el mismo componente que
 * estaba antes, movido tal cual.
 */
export function TourRunner({ tour, onClose }: { tour: Tour; onClose: (tour: Tour) => void }) {
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
