'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { registerRouteChange } from '@/lib/navigation-history'

/**
 * Monta una sola vez, en el layout raiz, y registra cada cambio de ruta
 * DENTRO de esta pestana (sin contar la primera). `BackButton` lo consulta
 * para decidir si el historial real es de fiar (D-089). No pinta nada.
 */
export function NavigationHistoryTracker() {
  const pathname = usePathname()
  const previous = useRef<string | null>(null)

  useEffect(() => {
    if (previous.current !== null && previous.current !== pathname) {
      registerRouteChange()
    }
    previous.current = pathname
  }, [pathname])

  return null
}
