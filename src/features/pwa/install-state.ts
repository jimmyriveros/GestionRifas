/**
 * Cuándo tiene sentido ofrecer la instalación, y cuándo no (D-117).
 *
 * Funciones puras a propósito: reciben lo que necesitan saber en vez de mirar
 * `window` por su cuenta, de modo que se pueden probar sin navegador. Quien las
 * llama es el componente, que sí vive en el navegador.
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
 * - `browser`: cualquier otro navegador. Se espera a que el propio navegador
 *   diga que la instalación es posible (`beforeinstallprompt`).
 */
export type InstallContext = 'standalone' | 'ios-safari' | 'browser'

/**
 * Detecta si la aplicación ya corre instalada.
 *
 * Hacen falta las DOS comprobaciones. Android y escritorio responden a la
 * consulta de medios `display-mode`; iOS no la implementó hasta tarde y lo que
 * expone es `navigator.standalone`, una propiedad suya que no existe en ningún
 * otro sitio.
 */
export function detectInstallContext(nav: Navigator, win: Window): InstallContext {
  const displayMode =
    typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (nav as Navigator & { standalone?: boolean }).standalone === true
  if (displayMode || iosStandalone) return 'standalone'

  return isIosSafari(nav.userAgent) ? 'ios-safari' : 'browser'
}

/**
 * Safari en iPhone o iPad.
 *
 * En iOS todos los navegadores usan el mismo motor, así que el sistema no basta:
 * hay que descartar Chrome, Firefox y Edge por su marca en el identificador,
 * porque el menú «Compartir → Agregar a pantalla de inicio» que se explica en el
 * aviso es el de Safari y en los otros no está en el mismo sitio.
 *
 * El iPad moderno se presenta como un Mac. Se le reconoce porque es el único
 * «Macintosh» con pantalla táctil.
 */
export function isIosSafari(userAgent: string): boolean {
  const isIos =
    /iphone|ipad|ipod/i.test(userAgent) ||
    (/macintosh/i.test(userAgent) && typeof document !== 'undefined' && 'ontouchend' in document)
  if (!isIos) return false

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
    const until = now + INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000
    window.localStorage.setItem(DISMISS_KEY, String(until))
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
