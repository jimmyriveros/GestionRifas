'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import { useUrlSearch, type UrlSearch } from '@/features/search/use-url-search'

/**
 * Estado compartido del catalogo publico: que partes del hero siguen a la vista
 * y el buscador (D-164, reorganizado en D-165).
 *
 * PARA QUE. Cuando el titulo de la rifa se va hacia arriba, el encabezado fijo
 * lo recoge; cuando el buscador se va, el buscador se muda a la MISMA FILA del
 * encabezado. Son dos decisiones INDEPENDIENTES —el titulo esta mas arriba, asi
 * que desaparece antes—, y por eso hay dos observadores y no un umbral de
 * scroll.
 *
 * POR QUE `IntersectionObserver` Y NO UN ESCUCHADOR DE SCROLL. Un `onScroll`
 * que ponga estado dispara un render por cada pixel movido; el observador avisa
 * SOLO en el cruce, fuera del hilo de composicion. Es la misma razon por la que
 * la cabecera contextual del portal usa lo mismo (D-150).
 *
 * POR QUE EL BUSCADOR VIVE AQUI. El campo se pinta en dos sitios —el hero y el
 * encabezado— pero **nunca en los dos a la vez**, y su estado es UNO: el
 * termino escrito, el debounce, `Enter`, `Escape`, el reinicio de `page` y el
 * indicador de carga salen de un solo `useUrlSearch`, llamado aqui. Lo que
 * cambia al mudarse es el sitio donde se pinta, no lo que sabe.
 *
 * Y EL FOCO SE MUDA CON EL. Cambiar de sitio en el DOM significa desmontar y
 * volver a montar el `<input>`, y el navegador no puede recordar solo el foco ni
 * la posicion del cursor de un elemento que ha dejado de existir. Se guardan al
 * desmontar y se restauran al montar: sin esto, a quien esta escribiendo se le
 * cierra el teclado del telefono a mitad de una palabra.
 *
 * POR QUE NO PARPADEA, Y ESTO ES LO QUE HAY QUE NO ROMPER. El parpadeo clasico
 * de este patron aparece cuando el cambio de estado MUEVE al elemento
 * observado: se oculta, el hueco se cierra, el elemento vuelve a entrar en
 * pantalla, se muestra otra vez. Aqui no puede pasar:
 *
 *   * El encabezado tiene alto FIJO (`h-14`), lleve o no lleve el buscador
 *     dentro, asi que el contenido nunca se desplaza.
 *   * El hueco del buscador en el hero conserva su altura cuando el campo se
 *     va, de modo que el elemento observado tampoco se mueve.
 *
 * Cualquier cambio que haga crecer el encabezado o vaciar el hueco del hero
 * reintroduce el bucle.
 */

/**
 * Alto del encabezado fijo, en pixeles: `h-14` (56) mas el borde inferior.
 *
 * TIENE QUE COINCIDIR con el alto real de `CatalogHeader`. Lo usan el margen
 * del observador —para que «visible» signifique «visible por debajo del
 * encabezado»— y nada mas desde D-165: el buscador ya no se coloca por su
 * cuenta, va dentro de la fila.
 */
export const CATALOG_HEADER_HEIGHT = 57

/** Minimo de caracteres del buscador publico. «7» es una busqueda completa. */
const CATALOG_SEARCH_MIN_CHARS = 1

/** Lo que hay que devolverle al campo cuando se muda de sitio. */
type FocusSnapshot = { start: number | null; end: number | null } | null

type CatalogStickyValue = {
  /** El titulo del hero ya no se ve: el encabezado lo recoge. */
  titleDocked: boolean
  /** El buscador del hero ya no se ve: se muda a la fila del encabezado. */
  searchDocked: boolean
  observeTitle: (element: Element | null) => void
  observeSearch: (element: Element | null) => void
  /** La UNICA fuente del termino, el debounce y el indicador de carga. */
  search: UrlSearch
  /** Guarda foco y cursor al desmontar el campo, y los devuelve al montarlo. */
  handoff: {
    save: (input: HTMLInputElement | null) => void
    restore: (input: HTMLInputElement | null) => void
  }
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
 * servidor— nada esta recogido, que es exactamente como se ve la pagina recien
 * abierta. Asi no hay un parpadeo de hidratacion.
 */
function useVisibleBelowHeader(): [boolean, (element: Element | null) => void] {
  const [visible, setVisible] = useState(true)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const observe = useCallback((element: Element | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!element) return

    // Sin `IntersectionObserver` —navegadores muy antiguos— no se recoge nada y
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

  /**
   * El buscador, UNA sola vez.
   *
   * `resetParams: ['page']` es lo que devuelve la lista a la primera pagina al
   * cambiar el termino; sin el, buscar desde la pagina 3 mostraria un hueco.
   */
  const search = useUrlSearch({
    minChars: CATALOG_SEARCH_MIN_CHARS,
    resetParams: ['page'],
  })

  /**
   * El testigo del foco entre un sitio y el otro.
   *
   * Es un `ref` y no estado: cambia durante el desmontaje y no debe provocar
   * ningun render. Se limpia al restaurar para que un montaje posterior —una
   * navegacion, por ejemplo— no robe el foco sin motivo.
   */
  const focusRef = useRef<FocusSnapshot>(null)

  const save = useCallback((input: HTMLInputElement | null) => {
    if (!input || document.activeElement !== input) return
    focusRef.current = { start: input.selectionStart, end: input.selectionEnd }
  }, [])

  const restore = useCallback((input: HTMLInputElement | null) => {
    const pendiente = focusRef.current
    if (!input || !pendiente) return
    focusRef.current = null
    input.focus({ preventScroll: true })
    if (pendiente.start !== null && pendiente.end !== null) {
      // `try` porque un `<input type="search">` no siempre admite seleccion en
      // todos los navegadores; perder el cursor es peor que no moverlo.
      try {
        input.setSelectionRange(pendiente.start, pendiente.end)
      } catch {
        /* el foco ya se devolvio, que es lo que importa */
      }
    }
  }, [])

  return (
    <CatalogStickyContext.Provider
      value={{
        titleDocked: !titleVisible,
        searchDocked: !searchVisible,
        observeTitle,
        observeSearch,
        search,
        handoff: { save, restore },
      }}
    >
      {children}
    </CatalogStickyContext.Provider>
  )
}

/**
 * Devuelve el estado compartido. Lanza si falta el proveedor: el buscador SIN
 * su estado no seria un buscador roto a medias, seria uno que no busca, y es
 * mejor que eso salte en desarrollo que servirlo asi.
 */
export function useCatalogSticky(): CatalogStickyValue {
  const value = useContext(CatalogStickyContext)
  if (!value) {
    throw new Error('useCatalogSticky necesita <CatalogStickyProvider> por encima.')
  }
  return value
}
