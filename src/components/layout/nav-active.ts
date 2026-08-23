/**
 * Que entrada del menu corresponde a la pantalla abierta.
 *
 * La regla vive aqui y no dentro de cada barra porque la usan las dos —la
 * lateral de escritorio y la inferior del telefono— y tienen que coincidir: si
 * se separaran, el mismo detalle de boleta se veria activo en una y apagado en
 * la otra (D-106).
 *
 * No es igualdad exacta de ruta. `/seller/tickets/<id>` y `/owner/tickets/bulk`
 * siguen siendo «Boletas», que es lo que espera quien entro desde ahi. El
 * separador es obligatorio para que `/owner/ticketsXYZ` —o una ruta futura que
 * empiece igual— no encienda la entrada equivocada.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
