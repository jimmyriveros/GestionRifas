/**
 * Estado de la barra lateral de escritorio (D-131).
 *
 * DOS COSAS DISTINTAS, A PROPOSITO:
 *
 *   PREFERENCIA  lo que la persona eligio con el boton. Se guarda y se respeta
 *                mientras navega y entre sesiones.
 *   SITIO        si la ventana da o no para tenerla abierta. Lo decide el
 *                navegador con una consulta de medios, no React.
 *
 * Mezclarlas es lo que produce los estados incoherentes que describe el
 * encargo: al estrechar la ventana la barra se cierra sola sin borrar lo que la
 * persona queria, y al volver a ensancharla se recupera su eleccion tal cual.
 * La restriccion manda sobre la preferencia en un solo sentido: puede cerrar
 * una barra que la persona dejo abierta, nunca abrir una que dejo cerrada.
 *
 * POR QUE UNA COOKIE Y NO `localStorage`. El resto de preferencias de interfaz
 * de la aplicacion vive en `localStorage` (recorrido guiado, aviso de
 * instalacion), pero esas se leen despues de pintar. Esta decide el ANCHO del
 * primer pintado: leida en el navegador, quien la tuviera cerrada veria la
 * barra abierta durante unos milisegundos y luego encogerse en cada carga. La
 * cookie llega con la peticion, asi que el HTML del servidor ya sale con el
 * ancho correcto. El layout de los dos portales ya es dinamico —lee la sesion—,
 * de modo que leer una cookie mas no cuesta nada.
 */

export const SIDEBAR_COOKIE = 'rifas.sidebar'

/** Un ano. Es una preferencia de interfaz: no caduca por si sola. */
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Ancho de ventana a partir del cual la barra puede estar abierta.
 *
 * DEBE COINCIDIR con la consulta de medios de `src/app/globals.css`, donde esta
 * la explicacion de por que son 85rem. Una prueba unitaria comprueba que las
 * dos digan lo mismo, para que nadie cambie una y se olvide de la otra.
 */
export const SIDEBAR_MIN_EXPANDED = '85rem'

/** La forma que entiende `window.matchMedia`. */
export const SIDEBAR_ROOM_QUERY = `(width >= ${SIDEBAR_MIN_EXPANDED})`

export type SidebarPreference = 'expanded' | 'collapsed'

/**
 * Cualquier cosa que no sea `collapsed` significa abierta: una cookie ausente,
 * vacia o manipulada no puede dejar a nadie sin menu.
 */
export function parseSidebarPreference(value: string | undefined | null): SidebarPreference {
  return value === 'collapsed' ? 'collapsed' : 'expanded'
}

/** Solo iconos: porque la persona la cerro o porque no cabe abierta. */
export function isSidebarCollapsed(preference: SidebarPreference, hasRoom: boolean): boolean {
  return preference === 'collapsed' || !hasRoom
}

/**
 * La cookie tal cual se escribe desde el navegador.
 *
 * `secure` solo cuando la pagina va por HTTPS: en `http://localhost` el
 * navegador descartaria la cookie y la preferencia no se guardaria al
 * desarrollar. No lleva datos de nadie —dice `expanded` o `collapsed`— y por eso
 * no necesita ser `httpOnly`: la escribe la propia pantalla.
 */
export function sidebarCookie(preference: SidebarPreference, secure: boolean): string {
  return [
    `${SIDEBAR_COOKIE}=${preference}`,
    'path=/',
    `max-age=${SIDEBAR_COOKIE_MAX_AGE}`,
    'samesite=lax',
    ...(secure ? ['secure'] : []),
  ].join('; ')
}
