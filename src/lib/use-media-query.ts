'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Consulta de medios sin romper la hidratacion.
 *
 * `useSyncExternalStore` obliga a declarar QUE ve el servidor, y aqui la
 * respuesta honesta es «no lo sabe»: en el servidor no hay ventana. Se devuelve
 * `false`, que en este proyecto significa la rama movil, porque la interfaz es
 * mobile-first (BR-X01) y equivocarse hacia el telefono es lo barato.
 *
 * ATENCION: esto sirve para decidir COMPORTAMIENTO, no para maquetar. Lo que se
 * ve y lo que ocupa se resuelve con clases de Tailwind (`hidden md:table-cell`),
 * que el navegador aplica antes de que exista JavaScript y por tanto no
 * parpadea. Aqui solo se decide, por ejemplo, si tocar una fila la selecciona o
 * abre su detalle.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  }, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/**
 * `true` en pantallas pequenas. El corte son los 768 px del `md` de Tailwind,
 * el mismo que usan `hideOnMobile` y el resto de la aplicacion: si se separaran,
 * habria un rango de anchos donde la columna se ve pero la fila no responde.
 */
export function useIsCompactScreen(): boolean {
  return !useMediaQuery('(min-width: 768px)')
}
