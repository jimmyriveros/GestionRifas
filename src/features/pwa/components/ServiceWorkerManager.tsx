'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

import { SERVICE_WORKER_URL } from '@/lib/pwa'

/**
 * Registra el service worker y avisa cuando hay una versión nueva (D-116).
 *
 * No pinta nada: vive en el armazón de la aplicación y solo habla por el aviso
 * de siempre (`sonner`), sin añadir barras ni recuadros que muevan la pantalla.
 *
 * SOLO EN PRODUCCIÓN, y no por prudencia genérica. En `next dev` Turbopack sirve
 * los fragmentos por direcciones SIN huella de contenido y los reemplaza al
 * vuelo; guardarlos «primero la caché» dejaría a quien programa mirando código
 * viejo sin entender por qué. Además, en desarrollo se DESREGISTRA cualquier
 * worker que hubiera quedado de una prueba anterior con `next start`, que es la
 * forma correcta de probar esto en local.
 *
 * NUNCA RECARGA SOLA. Una recarga en mitad de un abono se lleva por delante lo
 * que la persona estaba escribiendo, así que la versión nueva se instala en
 * segundo plano, se queda esperando y solo entra cuando se pulsa «Actualizar».
 */
export function ServiceWorkerManager() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister()
      })
      return
    }

    // `reloading` distingue la recarga que pedimos nosotros de la que provoca la
    // PRIMERA instalación, cuando el worker toma el control de una pestaña que
    // hasta entonces no tenía ninguno. Sin esta marca, la primera visita se
    // recargaría sola sin que nadie lo pidiera.
    let reloading = false
    const onControllerChange = () => {
      if (!reloading) return
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const announce = (waiting: ServiceWorker) => {
      toast('Hay una nueva versión de Rifas', {
        description: 'Actualiza cuando termines lo que estás haciendo.',
        duration: Infinity,
        // Arriba y no abajo: en el teléfono la barra de navegación y la de
        // selección múltiple viven en el borde inferior, y este aviso no puede
        // taparlas (D-106, D-110).
        position: 'top-center',
        action: {
          label: 'Actualizar',
          onClick: () => {
            reloading = true
            waiting.postMessage({ type: 'SKIP_WAITING' })
          },
        },
      })
    }

    let cancelled = false
    void navigator.serviceWorker
      .register(SERVICE_WORKER_URL)
      .then((registration) => {
        if (cancelled) return

        // Ya había una versión nueva esperando de una visita anterior.
        if (registration.waiting) announce(registration.waiting)

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            // `installed` + controlador existente = versión nueva en espera.
            // Sin controlador es la primera instalación y no hay nada que
            // anunciar: lo que se está viendo YA es la versión nueva.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              announce(installing)
            }
          })
        })
      })
      .catch(() => {
        // Que no se pueda registrar no rompe nada: la aplicación es la misma
        // aplicación web y sigue funcionando contra la red. No se molesta a la
        // persona con un error que no puede resolver.
      })

    return () => {
      cancelled = true
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  return null
}
