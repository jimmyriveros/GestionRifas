/**
 * Qué se puede ofrecer en este navegador, y cuándo callarse (D-117, D-123).
 *
 * Funciones puras a propósito: reciben lo que necesitan saber en vez de mirar
 * `window` por su cuenta, de modo que se pueden probar sin navegador. Quien las
 * llama es `install-store.ts`, que sí vive en el navegador.
 */

/** Un mes. Quien dice que no, no vuelve a oírlo hasta el mes siguiente. */
export const INSTALL_DISMISS_DAYS = 30

const DISMISS_KEY = 'rifas.pwa.install-dismissed-until'

/**
 * Cómo se está viendo la aplicación.
 *
 * - `standalone`: instalada, sin barra del navegador. No hay nada que ofrecer.
 * - `ios-safari`: Safari en iPhone o iPad. Se puede instalar, pero iOS no ofrece
 *   ningún aviso automático: hay que explicar los dos toques a mano.
 * - `ios-other`: iPhone o iPad en otro navegador. Ahí la instalación **no se
 *   puede hacer**, así que lo único útil es decir que se abra en Safari.
 * - `other`: cualquier otro navegador. Se espera a que él mismo diga que la
 *   instalación es posible (`beforeinstallprompt`).
 */
export type InstallPlatform = 'standalone' | 'ios-safari' | 'ios-other' | 'other'

/**
 * Detecta cómo se está viendo la aplicación.
 *
 * Hacen falta las DOS comprobaciones de «ya instalada». Android y escritorio
 * responden a la consulta de medios `display-mode`; iOS no la implementó hasta
 * tarde y lo que expone es `navigator.standalone`, una propiedad suya que no
 * existe en ningún otro sitio.
 */
export function detectPlatform(nav: Navigator, win: Window): InstallPlatform {
  const displayMode =
    typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (nav as Navigator & { standalone?: boolean }).standalone === true
  if (displayMode || iosStandalone) return 'standalone'

  if (!isIos(nav.userAgent)) return 'other'
  return isIosSafari(nav.userAgent) ? 'ios-safari' : 'ios-other'
}

/**
 * iPhone o iPad.
 *
 * El iPad moderno se presenta como un Mac. Se le reconoce porque es el único
 * «Macintosh» con pantalla táctil.
 */
export function isIos(userAgent: string): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true
  return /macintosh/i.test(userAgent) && typeof document !== 'undefined' && 'ontouchend' in document
}

/**
 * Safari, y no otro navegador de iOS.
 *
 * En iOS todos usan el mismo motor, así que el sistema no basta: hay que
 * descartar Chrome, Firefox, Edge y Opera por su marca en el identificador. La
 * distinción no es cosmética — solo Safari instala de verdad una aplicación
 * autónoma, y el menú «Compartir» que se explica está en su barra, no en la de
 * los demás.
 */
export function isIosSafari(userAgent: string): boolean {
  if (!isIos(userAgent)) return false
  return !/crios|fxios|edgios|opios/i.test(userAgent)
}

/** ¿Se descartó el aviso hace poco? Un fallo de almacenamiento no lo oculta. */
export function isInstallDismissed(now: number = Date.now()): boolean {
  try {
    const until = window.localStorage.getItem(DISMISS_KEY)
    return until !== null && Number(until) > now
  } catch {
    return false
  }
}

export function dismissInstallPrompt(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(now + INSTALL_DISMISS_DAYS * 86_400_000))
  } catch {
    // Sin almacenamiento el aviso volverá a aparecer. Es molesto, no roto.
  }
}

/** Tras instalar no hay nada más que ofrecer: se calla para siempre. */
export function silenceInstallPrompt(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Number.MAX_SAFE_INTEGER))
  } catch {
    // Igual que arriba.
  }
}
