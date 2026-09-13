'use client'

import { RefreshCwIcon } from 'lucide-react'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Cuando el catalogo publico NO se puede cargar (BR-K15, D-196, I-114).
 *
 * Hasta el 2026-09-13 lo recogia el `error.tsx` de la raiz: «Algo salió mal»,
 * fuera del tema del catalogo y con un boton que llama a `reset()`, que en esta
 * version de Next repinta SIN volver a pedir los datos. Quien llega por WhatsApp
 * a mirar numeros no tiene panel ni sesion: lo unico util es decirle que suele
 * ser pasajero y dejarle volver a intentarlo de verdad.
 *
 * NO ES «NO ENCONTRADO». Un corte no puede decir «Este enlace ya no está
 * disponible» (BR-K10): mandaria a pedir un enlace nuevo por algo que se arregla
 * solo en segundos. Y no enseña el mensaje ni el `digest` del error: en
 * produccion Next ya los oculta, y al visitante no le sirven.
 *
 * `retry()` vuelve a pedir el segmento al servidor (docs de `error.js`). Va
 * dentro de una transicion para que el boton diga «Reintentando…» mientras
 * tanto, con las mismas palabras que la pantalla sin conexion (D-116).
 */
export default function CatalogError({
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const [retrying, startRetry] = useTransition()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">No pudimos cargar los números disponibles</h1>
      <p className="text-muted-foreground text-sm">
        Suele ser algo pasajero. Vuelve a intentarlo en unos segundos.
      </p>
      <Button
        size="touch"
        className="mt-2"
        disabled={retrying}
        onClick={() => startRetry(() => retry())}
      >
        <RefreshCwIcon className={retrying ? 'animate-spin' : undefined} aria-hidden />
        {retrying ? 'Reintentando…' : 'Reintentar'}
      </Button>
    </main>
  )
}
