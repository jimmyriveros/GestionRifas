'use client'

import { detectPlatform } from '@/features/pwa/install-state'

/**
 * Lo único que sabe si esta aplicación se puede instalar ahora mismo (D-123).
 *
 * POR QUÉ UN MÓDULO Y NO UN `useEffect` DENTRO DEL COMPONENTE. Dos razones, y
 * las dos salieron de que la primera versión no se enteraba:
 *
 * 1. `beforeinstallprompt` se dispara UNA vez sobre `window`, y a menudo antes
 *    de que termine de montarse la pantalla. Un oyente colocado en el efecto de
 *    un componente puede llegar tarde y perderlo para siempre: el navegador no
 *    lo repite. Aquí se escucha en cuanto se carga el módulo.
 * 2. Ahora hay DOS sitios que lo necesitan —la tarjeta del panel y la opción del
 *    menú de usuario— y el evento no se puede consumir dos veces.
 *
 * Se lee con `useSyncExternalStore`, como `use-media-query.ts`: el resultado es
 * una CADENA, no un objeto, porque React compara con `Object.is` y un objeto
 * nuevo en cada llamada sería un bucle infinito.
 */

/** Evento que Chrome y Edge disparan cuando la instalación es posible. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Qué se le puede ofrecer a quien está mirando.
 *
 * - `unknown`: todavía no se sabe (servidor, o primer pintado).
 * - `prompt`: el navegador confirma que puede instalarla. Hay botón.
 * - `ios-safari`: hay que explicar los dos toques de Safari.
 * - `ios-other`: iPhone fuera de Safari. Solo cabe decir que la abra en Safari.
 * - `none`: ya está instalada, o no hay nada que ofrecer.
 */
export type InstallCapability = 'unknown' | 'prompt' | 'ios-safari' | 'ios-other' | 'none'

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Sin esto, Chrome muestra su propia barra. Se intercepta para ofrecerlo
    // donde decidimos nosotros y en el momento que decidimos.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    notify()
  })
}

export function subscribeToInstallCapability(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function readInstallCapability(): InstallCapability {
  if (typeof window === 'undefined') return 'unknown'
  if (installed) return 'none'

  const platform = detectPlatform(window.navigator, window)
  if (platform === 'standalone') return 'none'
  if (deferred) return 'prompt'
  if (platform === 'ios-safari') return 'ios-safari'
  if (platform === 'ios-other') return 'ios-other'

  // Android o escritorio donde el navegador todavía no ha dicho nada. Puede que
  // lo diga en un segundo, o puede que nunca: ofrecer un botón ahora sería
  // prometer algo que quizá no exista.
  return 'none'
}

/** En el servidor la respuesta honesta es «no lo sé». */
export function readInstallCapabilityOnServer(): InstallCapability {
  return 'unknown'
}

/**
 * Lanza el aviso NATIVO del navegador. Nunca se simula una instalación.
 *
 * El evento solo sirve una vez: aceptado o no, después ya no se puede reutilizar
 * y el navegador tampoco lo repite.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  const event = deferred
  deferred = null

  await event.prompt()
  const { outcome } = await event.userChoice
  notify()
  return outcome
}
