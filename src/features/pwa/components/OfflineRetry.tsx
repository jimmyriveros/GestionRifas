'use client'

import { RefreshCwIcon } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Botón «Reintentar» de la pantalla sin conexión (D-116).
 *
 * FUNCIONA AUNQUE NO HAYA JAVASCRIPT, y eso no es purismo: esta pantalla se
 * sirve desde la caché justo cuando NO hay red, y el fragmento de JavaScript que
 * la hidrata podría no estar guardado todavía. Un botón muerto en la única
 * pantalla que se ve sin conexión sería peor que no tener botón. Por eso lo de
 * abajo es un enlace de verdad a `/`, que el navegador sigue sin ayuda de nadie;
 * la portada reparte por rol como siempre (`src/app/page.tsx`).
 *
 * CON JavaScript hace dos cosas mejores:
 *
 * 1. Reintenta la dirección que se estaba abriendo, no la portada. El worker
 *    responde esta pantalla SIN cambiar la URL, así que recargar vuelve a
 *    intentar «Mis boletas» si eso era lo que se pedía.
 * 2. Se entera de que volvió la conexión y recarga sola.
 *
 * Ninguna de las dos reenvía nada: son navegaciones GET. Este proyecto no guarda
 * operaciones pendientes para mandarlas después (D-116), así que no hay ningún
 * abono esperando que un reintento pueda duplicar.
 *
 * `navigator.onLine` no decide nada: miente con facilidad —dice que hay red
 * cuando solo hay wifi sin salida—. Se usa como aviso para volver a intentarlo,
 * y quien resuelve si hay conexión de verdad es el intento.
 */
export function OfflineRetry() {
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    const retry = () => {
      setRetrying(true)
      window.location.reload()
    }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])

  return (
    <Button asChild disabled={retrying} className="h-11 sm:h-9">
      <Link
        href="/"
        onClick={(event) => {
          event.preventDefault()
          setRetrying(true)
          window.location.reload()
        }}
      >
        <RefreshCwIcon className={retrying ? 'animate-spin' : undefined} aria-hidden />
        {retrying ? 'Reintentando…' : 'Reintentar'}
      </Link>
    </Button>
  )
}
