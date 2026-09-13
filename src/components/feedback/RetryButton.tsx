'use client'

import { RefreshCwIcon } from 'lucide-react'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'

/**
 * «Reintentar» de una página de error (`error.tsx`): la general y la del
 * catálogo público (D-196).
 *
 * LLAMA A `retry()`, NO A `reset()`. En esta versión de Next, `reset()` limpia el
 * error y repinta el segmento SIN volver a pedir los datos, así que ante un fallo
 * del servidor —un corte de Supabase— el botón no recuperaba nada. `retry()`
 * vuelve a pedir el segmento al servidor (docs de `error.js`).
 *
 * Va dentro de una transición para decir «Reintentando…» mientras tanto, con las
 * mismas palabras que la pantalla sin conexión (D-116). Si vuelve a fallar, la
 * página de error se queda y el botón recupera su texto.
 */
export function RetryButton({ retry, className }: { retry: () => void; className?: string }) {
  const [retrying, startRetry] = useTransition()

  return (
    <Button
      size="touch"
      className={className}
      disabled={retrying}
      onClick={() => startRetry(() => retry())}
    >
      <RefreshCwIcon className={retrying ? 'animate-spin' : undefined} aria-hidden />
      {retrying ? 'Reintentando…' : 'Reintentar'}
    </Button>
  )
}
