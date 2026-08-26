import type { InstallCapability } from '@/features/pwa/install-store'

/**
 * Los textos del ofrecimiento de instalar, en un solo sitio (D-123).
 *
 * Los leen DOS piezas —la tarjeta del panel y la opción del menú de usuario—, y
 * un mismo mensaje no se escribe dos veces (`docs/UX_COPY_GUIDELINES.md`,
 * anexo B). Si se editan aquí, cambian en los dos.
 */

export const INSTALL_TITLE = 'Instala Rifas'

/**
 * Por qué instalarla. Es la misma frase en los tres casos a propósito: lo que
 * cambia entre un iPhone y un Android no es el motivo, es el procedimiento.
 */
export const INSTALL_REASON =
  'Se abre desde tu pantalla de inicio, sin buscar la dirección en el navegador.'

/**
 * Los pasos a dar, cuando de verdad hay pasos.
 *
 * Solo Safari de iOS los tiene: en Android y escritorio hay botón —lo explica el
 * propio navegador— y en el resto de navegadores de iPhone no hay ningún paso
 * que dar, hay que cambiar de navegador (ver `installNote`).
 */
export function installSteps(capability: InstallCapability): string[] {
  if (capability !== 'ios-safari') return []
  return ['Toca Compartir, en la barra de Safari.', 'Elige «Agregar a pantalla de inicio».']
}

/**
 * Lo que hay que saber ANTES de que haya pasos, para quien está en un iPhone
 * fuera de Safari.
 *
 * Va aparte de `installSteps` a propósito: no es un paso numerado, es el motivo
 * por el que aquí no hay ninguno. Presentarlo como «paso 1» sería mentir sobre
 * lo que la persona tiene que hacer. Y decirle «toca Compartir» sería mandarla a
 * un botón que en su navegador no está donde se le dice.
 */
export function installNote(capability: InstallCapability): string | null {
  if (capability !== 'ios-other') return null
  return 'En el iPhone y el iPad esto solo se puede hacer desde Safari. Abre allí esta misma dirección y te explicamos los dos pasos.'
}

/** Texto de la opción del menú de usuario. */
export const INSTALL_MENU_LABEL = 'Instalar aplicación'

/** Se dice al terminar, y solo cuando el navegador confirma que se instaló. */
export const INSTALL_DONE = 'Rifas quedó instalada en tu pantalla de inicio.'
