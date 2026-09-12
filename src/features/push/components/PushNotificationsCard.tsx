'use client'

import { BellRingIcon } from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { detectPlatform } from '@/features/pwa/install-state'
import { SERVICE_WORKER_URL, VAPID_PUBLIC_KEY } from '@/lib/pwa'

import { disablePushNotifications, enablePushNotifications } from '../actions'
import {
  PUSH_COPY,
  pushCapability,
  showsPushSection,
  vapidKeyToBytes,
  type PushCapability,
} from '../subscription'

/**
 * «Avisos en este dispositivo» (BR-V01, BR-V04..BR-V06; D-190).
 *
 * EL PERMISO SE PIDE AQUÍ Y A PROPÓSITO, nunca al cargar la aplicación (BR-V06).
 * Pedirlo sin contexto es la forma más rápida de que alguien lo bloquee para
 * siempre, y un permiso bloqueado no se puede volver a pedir desde la página:
 * hay que ir a la configuración del navegador. Por eso vive en la pantalla de
 * los recordatorios, que es lo único que hoy produce avisos, y el diálogo del
 * navegador solo aparece cuando se pulsa «Activar avisos».
 *
 * ES DE ESTE DISPOSITIVO, y eso decide el comportamiento entero: lo que se
 * pregunta no es «¿esta persona quiere avisos?» sino «¿este navegador está
 * registrado?». Se compara el endpoint que da el navegador con los que devuelve
 * la base. En un teléfono compartido, activar **cambia el dueño** de esa
 * suscripción: el anterior deja de recibir ahí, que es exactamente lo que tiene
 * que pasar.
 *
 * NO SE RENDERIZA NADA EN EL SERVIDOR: hasta que el navegador responde no se
 * sabe qué se puede ofrecer, y pintar una cosa para cambiarla un instante
 * después sería peor que esperar. `capability` empieza en `null` y la tarjeta
 * aparece cuando ya se sabe qué decir.
 */
export function PushNotificationsCard({ endpoints }: { endpoints: string[] }) {
  const [capability, setCapability] = useState<PushCapability | null>(null)
  const [isPending, startTransition] = useTransition()

  /**
   * Qué se puede ofrecer aquí y ahora.
   *
   * `getSubscription()` puede tardar —espera al service worker—, así que esto se
   * ejecuta después de pintar y vuelve a ejecutarse cuando cambian los endpoints
   * que llegan del servidor, que es lo que ocurre tras activar o apagar.
   */
  const evaluate = useCallback(async (): Promise<PushCapability> => {
    const configured = vapidKeyToBytes(VAPID_PUBLIC_KEY) !== null
    if (!configured) return 'no-configurado'

    const platform = detectPlatform(navigator, window)
    const supported =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

    // Solo se pregunta por la suscripción cuando de verdad puede haber una: sin
    // soporte la respuesta no cambiaría nada de lo que se enseña.
    const subscribedHere = supported ? await isSubscribedHere(endpoints) : false

    return pushCapability({
      configured,
      supported,
      platform,
      permission: supported ? Notification.permission : 'default',
      subscribedHere,
    })
  }, [endpoints])

  useEffect(() => {
    let cancelled = false
    void evaluate().then((next) => {
      if (!cancelled) setCapability(next)
    })
    return () => {
      cancelled = true
    }
  }, [evaluate])

  function enable() {
    startTransition(async () => {
      const subscription = await subscribeHere()
      if (subscription === null) {
        toast.error(PUSH_COPY.failed)
        // El permiso pudo quedar denegado: se vuelve a mirar para que la tarjeta
        // diga la verdad en vez de seguir ofreciendo un botón que ya no sirve.
        setCapability(await evaluate())
        return
      }

      const result = await enablePushNotifications(subscription)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(PUSH_COPY.enabled)
      setCapability('activo')
    })
  }

  function disable() {
    startTransition(async () => {
      const endpoint = await unsubscribeHere()
      if (endpoint === null) {
        // El navegador ya no tenía suscripción. No es un error: se sincroniza la
        // pantalla y se calla.
        setCapability(await evaluate())
        return
      }

      const result = await disablePushNotifications({ endpoint })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(PUSH_COPY.disabled)
      setCapability(await evaluate())
    })
  }

  if (capability === null || !showsPushSection(capability)) return null

  const blocked =
    capability === 'ios-sin-instalar' || capability === 'sin-soporte' || capability === 'bloqueado'

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
            <BellRingIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 className="text-heading-h5">{PUSH_COPY.title}</h2>
            <p className="text-body-small text-muted-foreground">{PUSH_COPY.description}</p>
          </div>
        </div>

        {blocked ? (
          <p className="text-body-small text-muted-foreground">{PUSH_COPY.blocked[capability]}</p>
        ) : capability === 'activo' ? (
          <div className="space-y-2">
            <p className="text-body-small">{PUSH_COPY.enabled}</p>
            <Button type="button" variant="outline" size="touch" onClick={disable} disabled={isPending}>
              {isPending ? PUSH_COPY.disabling : PUSH_COPY.disable}
            </Button>
          </div>
        ) : (
          <Button type="button" size="touch" onClick={enable} disabled={isPending}>
            {isPending ? PUSH_COPY.enabling : PUSH_COPY.enable}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/** ¿El endpoint de este navegador está entre los que conoce la base? */
async function isSubscribedHere(endpoints: string[]): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return false
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null && endpoints.includes(subscription.endpoint)
  } catch {
    return false
  }
}

/**
 * Pide el permiso y la suscripción, en ese orden, y devuelve lo que hay que
 * guardar. `null` si algo dijo que no.
 *
 * `userVisibleOnly: true` es obligatorio en los navegadores que importan y
 * además es un compromiso que el service worker cumple: enseña una notificación
 * por cada aviso recibido, incluso si llega sin texto.
 */
async function subscribeHere(): Promise<{
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
} | null> {
  try {
    const applicationServerKey = vapidKeyToBytes(VAPID_PUBLIC_KEY)
    if (applicationServerKey === null) return null

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    // `ready` y no `getRegistration()`: al activar hace falta un worker ACTIVO,
    // y en la primera visita puede estar todavía instalándose.
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL)
    await navigator.serviceWorker.ready

    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      }))

    const json = subscription.toJSON()
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (typeof p256dh !== 'string' || typeof auth !== 'string') return null

    return {
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      userAgent: navigator.userAgent,
    }
  } catch {
    return null
  }
}

/** Quita la suscripción del navegador y devuelve el endpoint que tenía. */
async function unsubscribeHere(): Promise<string | null> {
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return null
    const subscription = await registration.pushManager.getSubscription()
    if (subscription === null) return null

    const { endpoint } = subscription
    // Se desuscribe PRIMERO en el navegador: si esto falla, la fila de la base
    // seguiría describiendo algo real. Al revés quedaría un dispositivo
    // suscrito que la base ya no conoce y que nadie podría apagar.
    await subscription.unsubscribe()
    return endpoint
  } catch {
    return null
  }
}
