'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/**
 * Que partes del hero siguen a la vista (D-164).
 *
 * PARA QUE. Cuando el titulo de la rifa se va hacia arriba, el encabezado fijo
 * lo recoge; cuando el buscador se va, el buscador se posa bajo el encabezado.
 * Son dos decisiones INDEPENDIENTES —el titulo esta mas arriba, asi que
 * desaparece antes—, y por eso hay dos observadores y no un umbral de scroll.
 *
 * POR QUE `IntersectionObserver` Y NO UN ESCUCHADOR DE SCROLL. Un `onScroll`
 * que ponga estado dispara un render por cada pixel movido; el observador
 * avisa SOLO en el cruce, fuera del hilo de composicion. Es la misma razon por
 * la que la cabecera contextual del portal usa lo mismo (D-150).
 *
 * POR QUE NO PARPADEA, Y ESTO ES LO QUE HAY QUE NO ROMPER. El parpadeo clasico
 * de este patron aparece cuando el cambio de estado MUEVE al elemento
 * observado: se oculta, el hueco se cierra, el elemento vuelve a entrar en
 * pantalla, se muestra otra vez. Aqui no puede pasar:
 *
 *   * El encabezado NO cambia de alto al recoger el titulo —sustituye el texto
 *     de una linea que ya existia—, asi que el titulo del hero no se mueve.
 *   * El buscador que se posa es `fixed`, fuera del flujo, y su hueco en el
 *     hero conserva la altura exacta. El elemento observado tampoco se mueve.
 *
 * Cualquier cambio que haga crecer el encabezado o vaciar el hueco del hero
 * reintroduce el bucle.
 */

/** Alto del encabezado fijo. Tiene que coincidir con el de `CatalogHeader`. */
export const CATALOG_HEADER_HEIGHT = 57

type CatalogStickyValue = {
  /** El titulo del hero ya no se ve: el encabezado lo recoge. */
  titleDocked: boolean
  /** El buscador del hero ya no se ve: se posa bajo el encabezado. */
  searchDocked: boolean
  observeTitle: (element: Element | null) => void
  observeSearch: (element: Element | null) => void
}

const CatalogStickyContext = createContext<CatalogStickyValue | null>(null)

/**
 * `true` mientras el elemento se vea POR DEBAJO del encabezado fijo.
 *
 * El margen negativo superior encoge la zona que cuenta como «visible» hasta
 * donde termina el encabezado: un titulo tapado por el encabezado no esta
 * visible, aunque tecnicamente siga dentro de la ventana.
 *
 * Empieza en `true` a proposito: en el primer render —y en el HTML del
 * servidor— nada esta posado, que es exactamente como se ve la pagina recien
 * abierta. Asi no hay un parpadeo de hidratacion.
 */
function useVisibleBelowHeader(): [boolean, (element: Element | null) => void] {
  const [visible, setVisible] = useState(true)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const observe = useCallback((element: Element | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!element) return

    // Sin `IntersectionObserver` —navegadores muy antiguos— no se posa nada y
    // la pagina se queda como estaba: el buscador y el titulo viven en el hero
    // y todo sigue funcionando. Degradar asi es preferible a un polyfill.
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (entry) setVisible(entry.isIntersecting)
      },
      { rootMargin: `-${CATALOG_HEADER_HEIGHT}px 0px 0px 0px`, threshold: 0 },
    )
    observer.observe(element)
    observerRef.current = observer
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  return [visible, observe]
}

export function CatalogStickyProvider({ children }: { children: React.ReactNode }) {
  const [titleVisible, observeTitle] = useVisibleBelowHeader()
  const [searchVisible, observeSearch] = useVisibleBelowHeader()

  return (
    <CatalogStickyContext.Provider
      value={{
        titleDocked: !titleVisible,
        searchDocked: !searchVisible,
        observeTitle,
        observeSearch,
      }}
    >
      {children}
    </CatalogStickyContext.Provider>
  )
}

/**
 * Devuelve el estado compartido, o el estado «nada posado» si alguien usa la
 * pieza fuera del proveedor. No lanza: una pantalla publica que reventara por
 * un contexto ausente seria peor que una que se comporta como al principio.
 */
export function useCatalogSticky(): CatalogStickyValue {
  const value = useContext(CatalogStickyContext)
  if (value) return value
  return {
    titleDocked: false,
    searchDocked: false,
    observeTitle: () => {},
    observeSearch: () => {},
  }
}
