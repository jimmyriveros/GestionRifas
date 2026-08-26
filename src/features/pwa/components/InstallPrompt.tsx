'use client'

import { DownloadIcon, ShareIcon, SmartphoneIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  detectInstallContext,
  dismissInstallPrompt,
  isInstallDismissed,
  silenceInstallPrompt,
  type InstallContext,
} from '@/features/pwa/install-state'

/**
 * Evento que Chrome y Edge disparan cuando la instalación es posible.
 *
 * No está en la biblioteca de tipos del navegador porque no es un estándar de
 * todos, así que se declara con lo justo que se usa. No es un `any`: es la forma
 * real del evento, escrita a mano.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Solo en los dos paneles: es donde se aterriza al entrar. */
const DASHBOARD_PATHS = ['/owner/dashboard', '/seller/dashboard']

/**
 * Qué se puede ofrecer en ESTE navegador. `null` mientras se pinta en el
 * servidor, donde la respuesta honesta es «no lo sé».
 *
 * Se lee con `useSyncExternalStore` y no con un efecto que llame a `setState`,
 * por la misma razón que `useMediaQuery` (`src/lib/use-media-query.ts`): obliga
 * a declarar qué ve el servidor y evita el render de más. Devuelve una cadena, y
 * no un objeto, porque React compara el resultado con `Object.is` y un objeto
 * nuevo en cada llamada sería un bucle.
 */
type InstallEnvironment = InstallContext | 'dismissed'

/** No hay nada a lo que suscribirse: el entorno no cambia mientras se mira. */
const subscribeToNothing = () => () => {}

function readInstallEnvironment(): InstallEnvironment {
  if (isInstallDismissed()) return 'dismissed'
  return detectInstallContext(window.navigator, window)
}

/**
 * Ofrecimiento de instalar la aplicación (D-117).
 *
 * DÓNDE APARECE Y POR QUÉ AHÍ. Al final del contenido de los dos paneles, en el
 * flujo normal de la página: ni ventana, ni banda flotante, ni nada que tape lo
 * que se estaba mirando. El encargo pedía expresamente que no saliera un cuadro
 * grande nada más entrar, y una tarjeta al final de la pantalla de inicio se
 * lee cuando se llega a ella y se ignora sin esfuerzo. Como no está flotando,
 * tampoco puede empujar nada al aparecer: no genera salto de maquetación.
 *
 * CUÁNDO NO APARECE. Si ya está instalada —ni en modo autónomo ni tras un
 * `appinstalled`—, si el navegador no ofrece instalación, o si se descartó hace
 * menos de un mes.
 *
 * ANDROID Y ESCRITORIO usan el aviso NATIVO del navegador. Aquí solo se guarda
 * el evento y se pide el aviso cuando la persona pulsa: nunca se simula una
 * instalación ni se abre nada por nuestra cuenta.
 *
 * IPHONE no tiene esa capacidad, así que se explican los dos toques. Y solo en
 * iPhone: enseñarle a un usuario de Android el menú de Safari sería mandarlo a
 * buscar un botón que no existe en su teléfono.
 */
export function InstallPrompt() {
  const pathname = usePathname()
  const context = useSyncExternalStore(
    subscribeToNothing,
    readInstallEnvironment,
    () => null as InstallEnvironment | null,
  )
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Sin esto, Chrome muestra su propia barra. Se intercepta para que el
      // ofrecimiento salga donde no estorba y en el momento que decidimos.
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      silenceInstallPrompt()
      setHidden(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (hidden) return null
  if (!DASHBOARD_PATHS.includes(pathname)) return null
  if (context === null || context === 'standalone' || context === 'dismissed') return null
  // En cualquier navegador que no sea Safari de iOS se espera a que el propio
  // navegador confirme que se puede instalar. Ofrecerlo antes sería prometer un
  // botón que después no hace nada.
  if (context === 'browser' && deferred === null) return null

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // El evento solo sirve una vez: aceptado o no, ya no se puede volver a usar.
    setDeferred(null)
    if (outcome === 'accepted') silenceInstallPrompt()
    setHidden(true)
  }

  const dismiss = () => {
    dismissInstallPrompt()
    setHidden(true)
  }

  return (
    <Card className="mt-6">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <SmartphoneIcon className="text-muted-foreground size-6 shrink-0" aria-hidden />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <h2 className="font-semibold">Instala Rifas</h2>
            <p className="text-muted-foreground text-sm">
              Se abre desde tu pantalla de inicio, sin buscar la dirección en el navegador.
            </p>
          </div>

          {context === 'ios-safari' ? (
            <ol className="text-muted-foreground list-inside list-decimal space-y-1 text-sm">
              <li>
                Toca Compartir <ShareIcon className="inline size-4 align-text-bottom" aria-hidden />{' '}
                en la barra de Safari.
              </li>
              <li>Elige «Agregar a pantalla de inicio».</li>
            </ol>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2">
          {context === 'browser' ? (
            <Button onClick={install} className="h-11 grow sm:h-9 sm:grow-0">
              <DownloadIcon aria-hidden />
              Instalar
            </Button>
          ) : null}
          <Button variant="outline" onClick={dismiss} className="h-11 grow sm:h-9 sm:grow-0">
            Ahora no
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
