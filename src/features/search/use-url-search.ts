'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_SPINNER_DELAY_MS,
  meetsMinChars,
  normalizeSearchTerm,
} from '@/lib/search'

import { searchHint } from './hints'
import { useDelayedFlag } from './use-delayed-flag'

/**
 * Busqueda hibrida para las listas paginadas en servidor.
 *
 * Aqui no hay capa de fetch en el navegador: el termino vive en la URL, la
 * pantalla es un Server Component y `router.replace` ES la peticion. Asi que
 * lo que se retrasa con el debounce no es un `fetch`, es la navegacion.
 *
 * De ahi salen tres decisiones que conviene no deshacer sin pensarlas:
 *
 * - **`replace`, no `push`.** Con `push`, cada pausa al escribir dejaria una
 *   entrada en el historial y el boton «atras» iria devolviendo letra a letra.
 *   La direccion sigue siendo compartible y recargable, que es lo que importa.
 * - **La cancelacion la hace el router.** Una navegacion nueva sustituye a la
 *   anterior, asi que una respuesta vieja no puede pisar a una nueva. No hace
 *   falta `AbortController` porque no hay peticion propia que abortar.
 * - **El campo es controlado.** Antes se remontaba con `key` para que la URL
 *   fuera la unica fuente de verdad; eso ahora perderia el foco en cada
 *   busqueda. La URL sigue mandando, pero la sincronizacion es explicita.
 */

/**
 * Constante de modulo, no un `['page']` en la firma: un array nuevo en cada
 * render invalidaria los `useCallback` que dependen de el, y el debounce
 * volveria a crearse constantemente.
 */
const DEFAULT_RESET_PARAMS = ['page']

type UseUrlSearchOptions = {
  /** Parametro de la URL. `q` en todo el proyecto. */
  paramName?: string
  /** Minimo de caracteres para buscar sola. `Enter` y el boton se lo saltan. */
  minChars: number
  debounceMs?: number
  /** Parametros que dejan de tener sentido al cambiar el termino. */
  resetParams?: string[]
}

export type UrlSearch = {
  /** Lo que se ve escrito. Cambia en cada tecla, sin esperar a nada. */
  value: string
  onChange: (value: string) => void
  /** `Enter` o el boton de buscar: sin esperar al debounce ni al minimo. */
  submitNow: () => void
  clear: () => void
  /** Hay una navegacion en curso. */
  isSearching: boolean
  /** Se escribio algo que todavia no se ha buscado. */
  isPendingDebounce: boolean
  /** Falta texto para que la busqueda salga sola. */
  isBelowMinChars: boolean
  /** Ya se puede mostrar el indicador sin que parpadee. */
  showSpinner: boolean
  /** Pista lista para el campo. La pantalla puede pasar la suya en su lugar. */
  hint: string | undefined
}

export function useUrlSearch({
  paramName = 'q',
  minChars,
  debounceMs = SEARCH_DEBOUNCE_MS,
  resetParams = DEFAULT_RESET_PARAMS,
}: UseUrlSearchOptions): UrlSearch {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isSearching, startTransition] = useTransition()

  const urlTerm = searchParams.get(paramName) ?? ''
  const [value, setValue] = useState(urlTerm)
  const [isPendingDebounce, setIsPendingDebounce] = useState(false)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * Ultimo termino que ESTE componente puso en la URL.
   *
   * Distingue «la URL cambio porque yo busque» de «la URL cambio por otra cosa»
   * —el boton de limpiar filtros, el historial del navegador, un enlace—. Solo
   * en el segundo caso hay que reescribir lo que la persona tiene escrito.
   */
  const committedRef = useRef(urlTerm)

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsPendingDebounce(false)
  }, [])

  const commit = useCallback(
    (raw: string) => {
      cancelTimer()
      const term = normalizeSearchTerm(raw)
      // Sin cambios reales: no se repite la consulta (Paso 4). Cubre el caso de
      // pulsar Enter sobre lo que ya se busco, y el de escribir y borrar.
      if (term === committedRef.current) return

      committedRef.current = term
      const params = new URLSearchParams(searchParams.toString())
      if (term === '') params.delete(paramName)
      else params.set(paramName, term)
      // Cambiar el termino invalida la pagina en la que estabas.
      for (const key of resetParams) params.delete(key)

      const query = params.toString()
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname))
    },
    [cancelTimer, pathname, paramName, resetParams, router, searchParams],
  )

  const onChange = useCallback(
    (next: string) => {
      setValue(next)
      cancelTimer()

      const term = normalizeSearchTerm(next)
      // Borrar del todo restaura la lista al momento: esperar aqui solo haria
      // que la pantalla pareciera atascada.
      if (term === '') {
        commit('')
        return
      }
      // Por debajo del minimo no se busca sola, pero tampoco se deshace la
      // busqueda anterior: la lista se queda como estaba.
      if (!meetsMinChars(term, minChars)) return

      setIsPendingDebounce(true)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        setIsPendingDebounce(false)
        commit(next)
      }, debounceMs)
    },
    [cancelTimer, commit, debounceMs, minChars],
  )

  const submitNow = useCallback(() => commit(value), [commit, value])

  const clear = useCallback(() => {
    setValue('')
    commit('')
  }, [commit])

  // La URL cambio por fuera (limpiar filtros, atras del navegador): se refleja
  // en el campo. Si el cambio lo provocamos nosotros, `committedRef` ya coincide
  // y esto no hace nada, que es lo que evita pisar lo que se esta escribiendo.
  useEffect(() => {
    if (urlTerm !== committedRef.current) {
      committedRef.current = urlTerm
      setValue(urlTerm)
    }
  }, [urlTerm])

  // Al desmontar no debe quedar ningun temporizador navegando por su cuenta.
  useEffect(() => () => cancelTimer(), [cancelTimer])

  const showSpinner = useDelayedFlag(isSearching, SEARCH_SPINNER_DELAY_MS)
  const isBelowMinChars = value !== '' && !meetsMinChars(value, minChars)

  return {
    value,
    onChange,
    submitNow,
    clear,
    isSearching,
    isPendingDebounce,
    isBelowMinChars,
    showSpinner,
    hint: searchHint({ isBelowMinChars, minChars, isSearching }),
  }
}
