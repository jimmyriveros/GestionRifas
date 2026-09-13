/**
 * Compartir y descargar la imagen de la semana (BR-H07, D-194).
 *
 * Lo que no depende de React vive aquí para probarlo sin montar nada: la
 * dirección del PNG, si el navegador puede compartir un ARCHIVO y cómo se guarda
 * uno que ya está en memoria. La cancelación del menú se reconoce con
 * `isShareCancelled`, la misma función de «Comparte tu catálogo» (BR-K13).
 */

import type { ResultsWeek } from './week'

export const WEEKLY_RESULTS_IMAGE_PATH = '/api/weekly-results/image'

/**
 * La dirección del PNG. Solo lleva el lunes: quién lo pide y de qué rifa es lo
 * decide el servidor con la sesión, nunca un parámetro (BR-H05).
 */
export function weeklyResultsImageUrl(week: ResultsWeek): string {
  return `${WEEKLY_RESULTS_IMAGE_PATH}?week=${week.monday}`
}

/** Lo justo de `navigator` que hace falta. Así las pruebas pasan un doble. */
export type ShareCapableNavigator = Partial<Pick<Navigator, 'share' | 'canShare'>>

/**
 * `true` si este navegador puede compartir ESTE archivo con el menú del sistema.
 *
 * No basta con que exista `navigator.share`: en muchos escritorios existe y solo
 * comparte enlaces o texto. `canShare({ files })` es lo que dice si acepta una
 * imagen. Se pregunta con el archivo de verdad, no con uno de prueba.
 */
export function canShareFile(nav: ShareCapableNavigator | undefined, file: File): boolean {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false
  try {
    return nav.canShare({ files: [file] })
  } catch {
    return false
  }
}

/**
 * Lo que se le entrega a `navigator.share()`: la imagen, y además el título y el
 * mensaje cuando el navegador los acepta junto con un archivo. Si no los acepta,
 * se comparte solo la imagen y el mensaje se copia aparte.
 */
export function imageShareData(
  nav: ShareCapableNavigator,
  file: File,
  title: string,
  text: string,
): ShareData {
  const complete: ShareData = { files: [file], title, text }
  try {
    if (typeof nav.canShare === 'function' && nav.canShare(complete)) return complete
  } catch {
    // Un navegador que no sabe responder por el texto: se comparte la imagen sola.
  }
  return { files: [file] }
}

/**
 * Guarda un archivo que ya está en memoria —la dirección `blob:` de la vista
 * previa—, así que se descarga EXACTAMENTE la imagen que se está viendo, sin
 * volver a pedirla ni componer otra.
 */
export function saveFile(url: string, fileName: string, doc: Document = document): void {
  const link = doc.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  doc.body.append(link)
  link.click()
  link.remove()
}
