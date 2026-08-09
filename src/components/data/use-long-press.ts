'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Pulsacion larga sobre una fila: atajo para entrar en modo seleccion
 * (seccion 5 del encargo).
 *
 * Es un ATAJO y nada mas. La forma de descubrir la seleccion multiple es el
 * boton «Seleccionar», que siempre esta a la vista; construir la funcion sobre
 * un gesto invisible dejaria fuera a quien no lo conoce (seccion 49).
 *
 * Los dos detalles que hacen que no estorbe:
 *
 * 1. SOLO CON EL DEDO. Con raton no se dispara: mantener pulsado un boton del
 *    raton no significa nada en escritorio, y hacerlo significar algo
 *    sorprenderia.
 * 2. SI EL DEDO SE MUEVE, NO ERA UNA PULSACION LARGA, ERA UN DESPLAZAMIENTO.
 *    Sin esta comprobacion, bajar despacio por una lista larga acabaria
 *    seleccionando filas solo.
 *
 * Ademas anula el `click` que el navegador emite despues, para que la misma
 * pulsacion no seleccione y ademas abra el detalle.
 */

const LONG_PRESS_MS = 500
/** Pixeles que el dedo puede moverse sin que deje de contar como pulsacion. */
const MOVE_TOLERANCE = 10

export type LongPressHandlers = {
  onPointerDown: (event: React.PointerEvent) => void
  onPointerMove: (event: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
}

/**
 * Un solo temporizador para toda la tabla, no uno por fila: solo puede haber un
 * dedo manteniendo una fila a la vez, y asi el gancho se llama una vez y no
 * dentro del bucle de filas.
 */
export function useLongPress<T>(onLongPress: ((item: T) => void) | undefined): {
  getHandlers: (item: T) => LongPressHandlers | undefined
  /** `true` si el ultimo clic viene de una pulsacion larga y hay que ignorarlo. */
  consumeSuppressedClick: () => boolean
} {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    origin.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  const consumeSuppressedClick = useCallback(() => {
    const suppressed = suppressClick.current
    suppressClick.current = false
    return suppressed
  }, [])

  const getHandlers = (item: T): LongPressHandlers | undefined => {
    if (!onLongPress) return undefined
    return {
      onPointerDown: (event) => {
        if (event.pointerType === 'mouse') return
        origin.current = { x: event.clientX, y: event.clientY }
        timer.current = setTimeout(() => {
          timer.current = null
          suppressClick.current = true
          onLongPress(item)
        }, LONG_PRESS_MS)
      },
      onPointerMove: (event) => {
        const start = origin.current
        if (!start || timer.current === null) return
        const moved =
          Math.abs(event.clientX - start.x) > MOVE_TOLERANCE ||
          Math.abs(event.clientY - start.y) > MOVE_TOLERANCE
        if (moved) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
    }
  }

  return { getHandlers, consumeSuppressedClick }
}
