'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { tourSelector, type Tour, type TourStep } from '@/features/tour/tours'

/**
 * Logica del recorrido guiado: que paso toca, donde esta su elemento y como se
 * avanza. No dibuja nada; de eso se encarga `TourOverlay`.
 */

export type TargetRect = { top: number; left: number; width: number; height: number }

/**
 * Hueco que hay que dejarle al globo, con su separacion del elemento.
 *
 * No se mide el globo real —cuando esto corre todavia no existe—: se reserva lo
 * que mide el mas alto de todos los recorridos, 218 px, mas los 12 de su
 * separacion y un par de holgura.
 */
const BALLOON_SPACE = 232

/** Lo que tapa la barra superior fija (`h-14`), mas un poco de aire. */
const STICKY_HEADER = 72

function elementFor(step: TourStep): HTMLElement | null {
  if (!step.target) return null
  return document.querySelector<HTMLElement>(tourSelector(step.target))
}

/**
 * Un elemento sirve si de verdad ocupa espacio en pantalla. Con esto, un paso
 * que apunte a algo que este usuario no tiene —la barra lateral en un telefono,
 * un aviso que solo aparece cuando hay boletas por aprobar— se descarta solo,
 * sin preguntar por el rol ni por el ancho de la ventana.
 */
function isUsable(step: TourStep): boolean {
  if (!step.target) return true // paso centrado: no necesita elemento
  const element = elementFor(step)
  if (!element) return false
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false
  return getComputedStyle(element).visibility !== 'hidden'
}

export function usableSteps(tour: Tour): TourStep[] {
  return tour.steps.filter(isUsable)
}

/**
 * Espera a que la pantalla este lista para recorrerla.
 *
 * Hace falta porque las pantallas llegan en streaming detras de un `loading.tsx`:
 * al montar, lo que hay en el DOM todavia es el esqueleto de carga.
 *
 * No basta con esperar al PRIMER elemento. La barra lateral vive en el layout y
 * aparece de inmediato, mientras que las tarjetas del panel llegan despues: si
 * se arrancara ahi, el recorrido se quedaria en «Paso 1 de 2» y se perderia todo
 * lo demas. Por eso se espera a que la cuenta de elementos disponibles deje de
 * crecer durante `settleMs`, con un limite total por si la pantalla nunca para.
 */
export function waitForTour(
  tour: Tour,
  { timeoutMs = 6000, settleMs = 400 }: { timeoutMs?: number; settleMs?: number } = {},
): Promise<boolean> {
  const countTargets = () => usableSteps(tour).filter((step) => step.target).length

  return new Promise((resolve) => {
    let done = false
    let lastCount = -1
    let settleTimer: ReturnType<typeof setTimeout> | undefined

    const finish = (ready: boolean) => {
      if (done) return
      done = true
      observer.disconnect()
      clearTimeout(settleTimer)
      clearTimeout(limit)
      resolve(ready)
    }

    const check = () => {
      const count = countTargets()
      if (count === lastCount) return
      lastCount = count
      clearTimeout(settleTimer)
      if (count > 0) settleTimer = setTimeout(() => finish(true), settleMs)
    }

    const observer = new MutationObserver(check)
    const limit = setTimeout(() => finish(lastCount > 0), timeoutMs)

    observer.observe(document.body, { childList: true, subtree: true })
    check()
  })
}

type UseTourRunnerOptions = {
  tour: Tour | null
  /** Se llama al terminar y al omitir: en los dos casos el recorrido se da por visto. */
  onClose: (tour: Tour) => void
}

export function useTourRunner({ tour, onClose }: UseTourRunnerOptions) {
  const [index, setIndex] = useState(0)
  /**
   * La medida se guarda junto al paso que la produjo. Comparar ese `stepId` al
   * renderizar evita que el recuadro del paso anterior se quede un fotograma en
   * pantalla al avanzar, y evita tener que ponerlo en null desde un efecto.
   */
  const [tracked, setTracked] = useState<{ stepId: string; rect: TargetRect } | null>(null)

  // Los pasos se resuelven una sola vez, al arrancar: si se recalcularan en
  // cada render, el propio scroll del recorrido podria cambiar la lista de
  // pasos a mitad de camino y el contador «Paso 2 de 6» dejaria de cuadrar.
  const steps = useMemo(() => (tour ? usableSteps(tour) : []), [tour])

  const step = steps[index] ?? null
  const total = steps.length
  const isLast = index === total - 1
  const isFirst = index === 0
  const rect = step && tracked?.stepId === step.id ? tracked.rect : null

  const close = useCallback(() => {
    if (tour) onClose(tour)
  }, [tour, onClose])

  /**
   * La decision de cerrar se toma FUERA del actualizador de `setIndex`: React
   * ejecuta esos actualizadores durante el render, y cerrar desde ahi cambiaria
   * el estado del proveedor mientras se renderiza su hijo.
   */
  const next = useCallback(() => {
    if (index >= total - 1) {
      close()
      return
    }
    setIndex((current) => current + 1)
  }, [close, index, total])

  const previous = useCallback(() => setIndex((current) => Math.max(0, current - 1)), [])

  /**
   * Lleva el elemento a la vista cuando no se ve completo O cuando, viendose
   * entero, no deja hueco para el globo.
   *
   * `center` es lo natural para un elemento pequeño y deja de serlo con uno
   * ALTO: centrar una tarjeta de 390 px en una ventana de 720 parte el hueco
   * libre en dos mitades de 165, y el globo pide 232 con su separacion. Como no
   * cabe ni arriba ni abajo, Radix lo deja desbordado y el boton «Siguiente» se
   * queda fuera de la pantalla, sin forma de continuar el recorrido (D-124).
   *
   * Por eso un elemento que pasa de un tercio del alto de la ventana se lleva
   * ARRIBA en vez de al centro: todo el sobrante queda de un solo lado, que es
   * justo donde el globo va por defecto. Se hace con `scrollBy` y no con
   * `block: 'start'` porque la barra superior es fija y taparia la cabecera del
   * elemento resaltado.
   */
  useEffect(() => {
    if (!step) return
    const element = elementFor(step)
    if (!element) return

    const rect = element.getBoundingClientRect()
    const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight
    const roomForBalloon =
      window.innerHeight - rect.bottom >= BALLOON_SPACE || rect.top >= BALLOON_SPACE
    if (fullyVisible && roomForBalloon) return

    if (rect.height > window.innerHeight / 3) {
      window.scrollBy({ top: rect.top - STICKY_HEADER, behavior: 'smooth' })
      return
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  }, [step])

  /**
   * Posicion del elemento resaltado, seguida cuadro a cuadro.
   *
   * Un bucle de `requestAnimationFrame` cubre de una sola vez el scroll suave
   * del paso anterior, el giro del telefono, el teclado virtual y cualquier
   * cambio de tamano, sin encadenar escuchas de `scroll`, `resize` y
   * `ResizeObserver` que ademas se perderian la animacion del scroll.
   */
  const rectRef = useRef<TargetRect | null>(null)
  useEffect(() => {
    if (!step?.target) return

    const stepId = step.id
    rectRef.current = null
    let frame = 0

    const track = () => {
      const element = elementFor(step)
      if (element) {
        const box = element.getBoundingClientRect()
        const measured: TargetRect = {
          top: Math.round(box.top),
          left: Math.round(box.left),
          width: Math.round(box.width),
          height: Math.round(box.height),
        }
        const last = rectRef.current
        const moved =
          !last ||
          measured.top !== last.top ||
          measured.left !== last.left ||
          measured.width !== last.width ||
          measured.height !== last.height

        if (moved) {
          rectRef.current = measured
          setTracked({ stepId, rect: measured })
        }
      }
      frame = requestAnimationFrame(track)
    }

    frame = requestAnimationFrame(track)
    return () => cancelAnimationFrame(frame)
  }, [step])

  // Teclado: avanzar, retroceder y salir sin tocar la pantalla.
  useEffect(() => {
    if (!step) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        next()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        previous()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [step, close, next, previous])

  return { step, index, total, isFirst, isLast, rect, next, previous, close }
}
