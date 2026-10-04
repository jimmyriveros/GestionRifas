/**
 * Aviso de que el router EMPIEZA una navegación (D-245).
 *
 * Lo alimenta `onRouterTransitionStart`, en `src/instrumentation-client.ts`:
 * Next lo llama de forma síncrona al despachar cualquier navegación del router
 * —un `Link`, una fila con `router.push`, `router.replace`, Atrás o Adelante—,
 * ANTES de pedir el destino al servidor. Es el único momento en que se sabe que
 * la persona se va: `usePathname` no cambia hasta que la pantalla nueva está
 * pintada, y el desmontaje de la anterior llega todavía después.
 *
 * Abrir un enlace en otra pestaña no pasa por aquí: el router no navega en esta.
 *
 * Variable de módulo, como `navigation-history.ts`: vive lo que vive el
 * documento y no se guarda en ningún sitio.
 */
export type NavigationStartType = 'push' | 'replace' | 'traverse'

type Listener = (url: URL, type: NavigationStartType) => void

const listeners = new Set<Listener>()

export function subscribeNavigationStart(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * La última navegación pedida y la dirección del navegador desde la que salió (I-200, D-252).
 *
 * Next no cambia `window.location` hasta que la pantalla nueva llega —medido con una búsqueda
 * retenida 3 s—, así que mientras la dirección siga siendo `from`, esa navegación está EN
 * CAMINO. Atrás y Adelante no se guardan: van a una entrada del historial, no a una dirección
 * construida aquí.
 */
let latest: { url: URL; from: string } | null = null

export function notifyNavigationStart(href: string, type: NavigationStartType): void {
  const url = new URL(href, window.location.href)
  latest = type === 'traverse' ? null : { url, from: window.location.href }
  for (const listener of [...listeners]) listener(url, type)
}

/**
 * Los parámetros sobre los que se construye una dirección nueva de la pantalla `pathname`: un
 * orden, un filtro o una página (I-200, D-252).
 *
 * Los de la última navegación pedida si es de esta misma pantalla y todavía no ha llegado; si
 * no, los pintados. Antes se partía siempre de los pintados, y con una búsqueda en camino —que
 * aún no está en la dirección pintada— lo elegido se construía sin ella y, como navegación más
 * reciente, la sustituía: la lista quedaba sin buscar y el campo seguía diciendo lo escrito.
 *
 * Se llama al pulsar, no al pintar: lo que importa es la dirección de ESE momento.
 */
export function searchParamsToBuildOn(
  pathname: string,
  painted: { toString(): string },
): URLSearchParams {
  const pending = latest
  if (
    pending &&
    pending.from === window.location.href &&
    pending.url.origin === window.location.origin &&
    pending.url.pathname === pathname
  ) {
    return new URLSearchParams(pending.url.search)
  }
  return new URLSearchParams(painted.toString())
}

/**
 * ¿La navegación sale de la pantalla `pathname`?
 *
 * Sí, si va a otra ruta u otro origen. Y sí, SIEMPRE, si es Atrás o Adelante:
 * llevan a otra entrada del historial aunque sea de la misma ruta, y lo que se
 * hizo para la entrada de antes no tiene que caer encima de esa.
 *
 * No, si se queda en la misma ruta con otros parámetros: un filtro, la página o
 * el orden.
 */
export function leavesPage(
  url: URL,
  type: NavigationStartType,
  pathname: string,
  origin: string = window.location.origin,
): boolean {
  if (type === 'traverse') return true
  if (url.origin !== origin) return true
  return url.pathname !== new URL(pathname, origin).pathname
}
