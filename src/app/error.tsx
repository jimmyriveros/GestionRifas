'use client'

import { useEffect } from 'react'

import { RetryButton } from '@/components/feedback/RetryButton'

/**
 * La página de error general: recoge el fallo de cualquier pantalla que no tenga
 * su propio `error.tsx` (D-196).
 *
 * «Reintentar» vuelve a pedir la pantalla al servidor con `retry()`. Hasta el
 * 2026-09-13 llamaba a `reset()`, que en esta versión de Next repinta sin volver
 * a pedir los datos: ante un fallo del servidor, el botón no recuperaba nada.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <div>
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="text-muted-foreground">Ocurrió un error inesperado. Intenta de nuevo.</p>
      </div>
      <RetryButton retry={retry} />
    </div>
  )
}
