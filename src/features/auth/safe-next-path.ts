/**
 * El destino al que se vuelve después de ingresar o de abrir un enlace de Auth (`next`, D-253).
 *
 * Solo se acepta una ruta de ESTA aplicación, y se devuelve tal como la va a resolver el navegador.
 * No basta con mirar que empiece por `/` y no por `//`: el router de Next resuelve el destino de una
 * Server Action con `new URL(destino, dirección actual)` —lo mismo que hace un navegador con una
 * cabecera `Location`—, y ese parser convierte `\` en `/` y elimina tabuladores y saltos de línea.
 * Así, `/\evil.test` o `/<TAB>/evil.test` se vuelven `//evil.test`: otro sitio.
 *
 * Por eso se resuelve aquí con el MISMO parser, contra un origen propio, y se exige que el resultado
 * siga en ese origen y que su ruta empiece por una sola barra. Las barras invertidas, los espacios
 * y los caracteres de control se rechazan antes, aunque el parser los fuera a tolerar: ninguna ruta
 * de Rifas los lleva sin codificar.
 *
 * Lo usan el inicio de sesión (`login`, también cuando no se pudo comprobar el acceso, D-248), su
 * página y el callback de Auth. Quien recibe `null` usa su destino por defecto: el panel del rol o
 * la portada.
 */

/** Un origen que no existe (`.invalid`, RFC 2606): solo sirve de base para resolver. */
const SAME_ORIGIN = 'http://rifas.invalid'

/** Ninguna ruta de Rifas se acerca a esto; un destino así no es un destino. */
const MAX_LENGTH = 2048

/** Barras invertidas, espacios de cualquier tipo y caracteres de control. */
const FORBIDDEN = /[\\\s\u0000-\u001f\u007f]/

export function safeNextPath(next: unknown): string | null {
  if (typeof next !== 'string' || next.length === 0 || next.length > MAX_LENGTH) return null
  if (!next.startsWith('/') || next.startsWith('//') || FORBIDDEN.test(next)) return null

  let url: URL
  try {
    url = new URL(next, SAME_ORIGIN)
  } catch {
    return null
  }
  if (url.origin !== SAME_ORIGIN) return null

  // `/..//evil.test` sigue en el origen, pero se normaliza a `//evil.test`: devuelto así, el
  // navegador lo leería como otro sitio.
  const path = `${url.pathname}${url.search}${url.hash}`
  if (path.startsWith('//')) return null
  return path
}
