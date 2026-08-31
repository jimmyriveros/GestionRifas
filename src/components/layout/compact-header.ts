/**
 * Cabecera contextual (D-150).
 *
 * El umbral es la altura real de la cabecera fija (`h-14` = 56 px). Cuando el
 * borde inferior del `PageHeader` queda a esa altura o por encima, el bloque
 * entero ya no se ve debajo de la cabecera y el titulo compacto puede subir.
 *
 * La decision vive aqui, sin React, para poder probarla sin montar el observer.
 */

/** Alto de la cabecera de `AppShell` (`h-14`). Coincide con `--app-header-height`. */
export const APP_HEADER_HEIGHT_PX = 56

/**
 * El encabezado de la pantalla ya no se ve por debajo de la cabecera fija.
 *
 * `bottom` es el borde inferior del `PageHeader` en coordenadas del viewport,
 * el mismo dato que entrega `getBoundingClientRect()` / IntersectionObserver.
 */
export function isPageHeaderHidden(bottom: number, stickyHeight: number): boolean {
  return bottom <= stickyHeight
}
