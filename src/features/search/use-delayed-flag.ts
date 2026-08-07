'use client'

import { useEffect, useState } from 'react'

/**
 * Devuelve `true` solo si la bandera lleva encendida mas de `delayMs`.
 *
 * Sirve para los indicadores de carga: una respuesta rapida apaga la bandera
 * antes de que se cumpla el plazo y el indicador nunca llega a pintarse, que es
 * justo lo que evita el parpadeo. No retrasa nada real —la consulta sale igual
 * de pronto—, solo lo que se ve.
 *
 * Se apaga de inmediato, sin plazo: una vez visible, esconderlo tarde seria
 * peor que no haberlo mostrado.
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) return

    const timer = setTimeout(() => setVisible(true), delayMs)
    // Apagarlo va en la limpieza, no en el cuerpo del efecto: un `setState`
    // sincrono ahi encadena renders y el compilador de React lo rechaza. La
    // limpieza corre cuando `active` pasa a `false`, que es justo el momento.
    return () => {
      clearTimeout(timer)
      setVisible(false)
    }
  }, [active, delayMs])

  return visible
}
