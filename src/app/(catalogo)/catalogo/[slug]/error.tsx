'use client'

import { RetryButton } from '@/components/feedback/RetryButton'

/**
 * Cuando el catalogo publico NO se puede cargar (BR-K15, D-196, I-114).
 *
 * Hasta el 2026-09-13 lo recogia el `error.tsx` de la raiz: «Algo salió mal»,
 * fuera del tema del catalogo y con un boton que llamaba a `reset()`, que en esta
 * version de Next repinta SIN volver a pedir los datos. Quien llega por WhatsApp
 * a mirar numeros no tiene panel ni sesion: lo unico util es decirle que suele
 * ser pasajero y dejarle volver a intentarlo de verdad.
 *
 * NO ES «NO ENCONTRADO». Un corte no puede decir «Este enlace ya no está
 * disponible» (BR-K10): mandaria a pedir un enlace nuevo por algo que se arregla
 * solo en segundos. Y no enseña el mensaje ni el `digest` del error: en
 * produccion Next ya los oculta, y al visitante no le sirven.
 *
 * El boton es `RetryButton`, el mismo de la pagina de error general: llama a
 * `retry()`, que vuelve a pedir el segmento al servidor.
 */
export default function CatalogError({
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">No pudimos cargar los números disponibles</h1>
      <p className="text-muted-foreground text-sm">
        Suele ser algo pasajero. Vuelve a intentarlo en unos segundos.
      </p>
      <RetryButton retry={retry} className="mt-2" />
    </main>
  )
}
