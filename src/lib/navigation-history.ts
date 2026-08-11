/**
 * Cuenta cuantas veces cambio la ruta DENTRO de esta instancia de documento,
 * sin contar la primera carga. Variable de modulo a proposito: una carga
 * dura (URL escrita a mano, marcador, refrescar) reinicia todo el contexto de
 * JavaScript y la deja en 0 sola; una navegacion propia de la aplicacion (un
 * enlace, una fila de tabla) no recarga el documento, asi que el valor
 * sobrevive (D-089).
 *
 * Por que NO `sessionStorage`: sobrevive a una carga dura, que es justo lo
 * contrario de lo que hace falta aqui. Con una marca en `sessionStorage`,
 * abrir una boleta por URL directa justo despues de iniciar sesion parecia
 * tener una pantalla anterior real -la habia, pero era el panel del login,
 * no nada relacionado con la boleta- y la flecha mandaba al usuario a un
 * sitio inesperado en vez de al listado. Sin persistencia, cada carga dura
 * empieza limpia y esa confusion no puede ocurrir.
 */
let routeChanges = 0

export function registerRouteChange() {
  routeChanges += 1
}

export function hasInternalHistory(): boolean {
  return routeChanges > 0
}
