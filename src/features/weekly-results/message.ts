/**
 * El mensaje que acompaña la imagen de «Resultados de la semana»: cuál se usa y
 * cuánto puede medir el propio (BR-H06, BR-H09, D-197).
 *
 * PURO Y SIN IMPORTACIONES. Lo usan el componente cliente —que decide, mientras
 * se escribe, qué mensaje se ve, se copia y se comparte—, la consulta, el esquema
 * y las pruebas. No importa `copy.ts` a propósito: ese módulo trae las constantes
 * de loterías y el navegador no las necesita. El predeterminado de la semana
 * llega ya escrito desde el servidor.
 */

/** Lo que puede medir el mensaje propio. El mismo tope que el CHECK de la 0056. */
export const WEEKLY_RESULTS_MESSAGE_MAX_LENGTH = 1000

/** La configuración del mensaje de un vendedor, tal como sale de su membresía. */
export type WeeklyResultsMessageSettings = {
  useCustomMessage: boolean
  /** Lo que escribió, recortado. `null` si nunca escribió nada o lo vació a propósito. */
  customMessage: string | null
}

/** Sin personalización: el predeterminado. Es lo que tiene toda membresía al nacer. */
export const EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS: WeeklyResultsMessageSettings = {
  useCustomMessage: false,
  customMessage: null,
}

/**
 * Lo que devuelve la lectura: la configuración, o que no se pudo leer.
 *
 * Un fallo NO es la configuración vacía: tratarlo así ofrecería guardar encima de
 * un mensaje propio que no se ha podido ver.
 */
export type WeeklyResultsMessageSettingsResult =
  { kind: 'ready'; settings: WeeklyResultsMessageSettings } | { kind: 'error' }

/**
 * El mensaje que se ve en la vista previa, se copia y se comparte (BR-H09).
 *
 * El interruptor manda sobre el texto guardado, no al revés: apagado se usa el
 * predeterminado aunque haya un texto propio conservado. Encendido se usa el
 * propio tal cual, recortado por fuera, sin sustituir nada dentro: no hay
 * marcadores. Y si está vacío se cae al predeterminado en vez de compartir un
 * mensaje vacío. El CHECK de la 0056 impide guardar ese estado; aquí se cubre
 * también el que existe un instante mientras se escribe, y cualquier dato
 * escrito a mano.
 *
 * `defaultMessage` es `weeklyResultsMessage(week)` ya compuesto: por eso quien no
 * usa uno propio sigue viendo la semana correcta y cualquier mejora de la
 * redacción.
 */
export function activeWeeklyResultsMessage(
  settings: WeeklyResultsMessageSettings,
  defaultMessage: string,
): string {
  if (!settings.useCustomMessage) return defaultMessage
  const custom = settings.customMessage?.trim() ?? ''
  return custom === '' ? defaultMessage : custom
}
