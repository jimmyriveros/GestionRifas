import type { Metadata } from 'next'
import { WifiOffIcon } from 'lucide-react'

import { OfflineRetry } from '@/features/pwa/components/OfflineRetry'

export const metadata: Metadata = {
  title: 'Sin conexión',
  robots: { index: false, follow: false },
}

/**
 * SE RENDERIZA POR PETICIÓN, aunque su contenido sea fijo (D-116, I-070).
 *
 * No es un capricho ni una duda sobre el contenido: es la única forma de que
 * esta pantalla tenga JavaScript. La política de seguridad usa
 * `'strict-dynamic'` con un nonce distinto en cada petición (D-061), y una
 * página PRERENDERIZADA no puede llevar ese nonce —se genera al construir, no al
 * pedirla—, así que el navegador bloquea todos sus scripts. Se descubrió aquí y
 * resultó que `/forgot-password` llevaba así desde la Fase 7, con el flujo de
 * recuperación de contraseña roto en producción: I-070, corregido en D-121.
 *
 * Con `force-dynamic` el nonce del HTML y el de la cabecera coinciden, y siguen
 * coincidiendo cuando el service worker la sirve desde la caché, porque lo que
 * se guarda es la respuesta ENTERA, cabecera incluida.
 *
 * Cuesta una invocación del servidor por versión y por dispositivo: la que hace
 * el worker al instalarse.
 */
export const dynamic = 'force-dynamic'

/**
 * Pantalla que se ve cuando no hay red (D-116).
 *
 * La guarda el service worker al instalarse y la sirve cuando una navegación no
 * llega al servidor. Tiene que ser ESTÁTICA y PÚBLICA: se guarda una sola vez y
 * la puede ver cualquiera, con sesión o sin ella, así que no consulta nada.
 *
 * Sigue el mismo molde que `/denied` y `/not-found` —icono, título, explicación,
 * una acción— para que no parezca otra aplicación.
 *
 * EL TEXTO NO PROMETE LO QUE NO HAY. La versión de ejemplo del encargo decía
 * «puedes revisar algunas partes de Rifas»; aquí eso sería mentira, porque no se
 * guarda ni una boleta ni un pago en el teléfono (D-116). Se dice lo que pasa y
 * lo que hay que hacer, que es lo que pide la §7 de la guía de redacción.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <WifiOffIcon className="text-muted-foreground size-12" aria-hidden="true" />
      <div className="max-w-sm space-y-1">
        <h1 className="text-xl font-semibold">Estás sin conexión</h1>
        <p className="text-muted-foreground">
          Necesitas internet para ver tus boletas y para registrar ventas o abonos. Vuelve a
          intentarlo cuando tengas señal.
        </p>
      </div>
      <OfflineRetry />
    </div>
  )
}
