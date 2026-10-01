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

export function notifyNavigationStart(href: string, type: NavigationStartType): void {
  if (listeners.size === 0) return
  const url = new URL(href, window.location.href)
  for (const listener of [...listeners]) listener(url, type)
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
