import { notifyNavigationStart, type NavigationStartType } from '@/lib/navigation-start'

/**
 * Next lo llama al EMPEZAR cada navegación del router, de forma síncrona y
 * antes de pedir el destino (D-245). Solo se reenvía: quien escucha está en
 * `lib/navigation-start.ts`.
 *
 * Este archivo corre en TODAS las páginas antes de hidratar: no añadas nada que
 * pese ni nada que se ejecute al cargar.
 */
export function onRouterTransitionStart(url: string, navigationType: NavigationStartType) {
  notifyNavigationStart(url, navigationType)
}
