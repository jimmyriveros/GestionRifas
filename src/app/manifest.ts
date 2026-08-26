import type { MetadataRoute } from 'next'

import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, THEME_COLOR } from '@/lib/pwa'

/**
 * Manifiesto de la aplicación instalable (D-115).
 *
 * Next lo sirve en `/manifest.webmanifest` y lo enlaza solo desde el `<head>`;
 * no hay que escribir la etiqueta a mano. No lee nada del request, así que es
 * estático y sale del CDN.
 *
 * DECISIONES QUE NO SON OBVIAS
 *
 * `start_url: '/'` — La portada NO es una pantalla: es el reparto por rol que ya
 * existe (`src/app/page.tsx`). Dueño y administrador acaban en
 * `/owner/dashboard`, el vendedor en `/seller/dashboard`, y quien no tenga
 * sesión, en `/login`. Fijar aquí `/seller/dashboard` habría sido más rápido
 * para el caso frecuente y habría mandado a un dueño a una pantalla que no le
 * corresponde. No se crea ningún camino paralelo para la aplicación instalada.
 *
 * `id: '/'` — Identidad estable de la aplicación instalada. Sin él, el navegador
 * la deduce de `start_url`, y cambiar esa ruta algún día se vería como una
 * aplicación DISTINTA: la instalada se quedaría huérfana en la pantalla de
 * inicio.
 *
 * Colores en blanco — La aplicación se ve siempre en claro: `globals.css` define
 * `.dark`, pero nadie enciende esa clase (no hay selector de tema). El blanco es
 * el color real del encabezado, así que la barra de estado de Android y la
 * pantalla de arranque continúan la pantalla en vez de contradecirla.
 *
 * Sin `orientation` — La misma aplicación se usa en teléfono, tableta y
 * escritorio. Fijar `portrait` le quitaría el giro a una tableta sin ganar nada.
 *
 * Dos juegos de iconos — `any` es el icono tal cual; `maskable` es el mismo
 * dibujo más pequeño, para que el recorte que aplica Android no le corte una
 * esquina. Se declaran por separado, nunca `purpose: 'any maskable'` en el
 * mismo archivo: eso obliga a un solo dibujo a servir para las dos cosas y sale
 * mal en las dos.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    lang: 'es-CO',
    dir: 'ltr',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
