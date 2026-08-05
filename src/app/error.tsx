'use client'

import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
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
      <Button onClick={reset}>Reintentar</Button>
    </div>
  )
}
