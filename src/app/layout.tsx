import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'

import { NavigationHistoryTracker } from '@/components/layout/NavigationHistoryTracker'
import { Toaster } from '@/components/ui/sonner'
import { ServiceWorkerManager } from '@/features/pwa/components/ServiceWorkerManager'
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, THEME_COLOR } from '@/lib/pwa'

import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

/*
 * `Geist_Mono` SE RETIRÓ el 2026-08-26 (D-118).
 *
 * Estaba declarado desde el principio y el navegador lo descargaba y lo
 * precargaba —28,6 KB en la ruta crítica—, pero no lo usaba NADIE: `globals.css`
 * declara `--font-sans` dentro de `@theme inline` y nunca declaró `--font-mono`,
 * así que las diez apariciones de `font-mono` de la aplicación se pintan, y se
 * pintaban ya antes de este cambio, con la pila monoespaciada del sistema.
 *
 * Quitarlo NO cambia ni un píxel de lo que se ve. Si algún día se quiere que
 * esos números salgan en Geist Mono, hay que volver a declarar la fuente Y
 * añadir `--font-mono: var(--font-geist-mono)` al bloque `@theme inline`; sin lo
 * segundo, lo primero solo pesa. Ver `docs/KNOWN_ISSUES.md` I-070.
 */

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  /**
   * Iconos de la pestaña y de la pantalla de inicio de iOS. El manifiesto
   * (`src/app/manifest.ts`) lleva los de Android; iOS lo ignora y usa este.
   */
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: APP_SHORT_NAME,
    /**
     * `default`, no `black-translucent`. Con la barra de estado translúcida el
     * contenido pasa POR DEBAJO de la hora y la batería, y el encabezado de la
     * aplicación quedaría medio tapado en cuanto alguien no llevara la cuenta de
     * un `env(safe-area-inset-top)`. Con `default`, iOS reserva esa franja y la
     * pinta del color del tema, que aquí es el mismo blanco del encabezado: se
     * ve como una continuación de la aplicación y no hay nada que corregir.
     */
    statusBarStyle: 'default',
  },
  /**
   * Las dos etiquetas que Next NO escribe, y hacen falta las dos.
   *
   * Se comprobó sobre el build de producción (2026-08-26): con
   * `appleWebApp.capable: true`, Next 16.3 emite `apple-mobile-web-app-title` y
   * `apple-mobile-web-app-status-bar-style`, pero **no** la de `capable`. Sin
   * ella, un iPhone con iOS anterior al soporte de `display: standalone` del
   * manifiesto agrega el icono a la pantalla de inicio y al tocarlo abre Safari
   * CON su barra: justo lo que la instalación venía a evitar.
   *
   * `mobile-web-app-capable` es la versión estándar de la misma etiqueta, la que
   * recomienda hoy la documentación web; la de Apple se conserva porque los iOS
   * viejos solo entienden esa. Si una versión futura de Next las escribiera,
   * sobraría una etiqueta repetida, que es inofensivo.
   */
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
  },
  formatDetection: {
    /**
     * iOS convierte en enlaces de llamada cualquier cosa que le parezca un
     * teléfono, y esta aplicación está llena de números de cuatro cifras. Un
     * número de boleta subrayado en azul que abre el marcador no es un detalle
     * estético: es un toque perdido en la pantalla que más se usa.
     */
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: THEME_COLOR,
  /**
   * `viewport-fit: cover` (D-119).
   *
   * Sin esto, un iPhone con la aplicación instalada deja franjas del color de
   * fondo arriba y abajo y la pantalla no llega a los bordes. Con esto llega, y
   * a cambio hay que apartar el contenido de la muesca y del indicador
   * inferior. Ya estaba medio hecho: `globals.css` reservaba desde D-106 el
   * `env(safe-area-inset-bottom)` de la barra de navegación con valor de
   * repuesto 0 «por si algún día se activa esta opción». Es este día.
   *
   * NO se toca el zoom: ni `maximumScale` ni `userScalable`. Impedir ampliar
   * rompe la accesibilidad de quien no ve bien, y el problema que suele
   * empujar a prohibirlo —iOS amplía solo al enfocar un campo con letra menor
   * de 16 px— aquí no existe: `Input` y `Textarea` ya son `text-base` (16 px)
   * en el teléfono y bajan a `text-sm` solo desde `md`, y los desplegables no
   * son `<select>` nativos, así que tampoco enfocan nada (D-119).
   */
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${geistSans.variable} antialiased`}>
        <NavigationHistoryTracker />
        {children}
        <Toaster />
        <ServiceWorkerManager />
      </body>
    </html>
  )
}
