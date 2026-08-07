'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_SPINNER_DELAY_MS,
  meetsMinChars,
  normalizeSearchTerm,
} from '@/lib/search'

import { searchHint } from './hints'
import { useDelayedFlag } from './use-delayed-flag'

/**
 * Busqueda hibrida contra el servidor para dialogos y selectores.
 *
 * La usan las listas que NO viven en la URL: elegir cliente al asignar una
 * boleta, elegir cliente al registrar un abono. Antes traian 200 registros al
 * navegador y filtraban en memoria, con lo que el cliente 201 era sencillamente
 * inencontrable (I-036). Aqui cada busqueda va al servidor y no hay techo.
 *
 * **Como se evita la condicion de carrera.** Una Server Action no se puede
 * abortar: no hay `AbortController` que valga porque la peticion la gestiona el
 * runtime, no nuestro codigo. Se usa el mecanismo equivalente —y suficiente—:
 * cada consulta lleva un numero de orden, y al volver se compara con el ultimo
 * emitido. Si no coincide, la respuesta se tira. Una respuesta lenta de «ana»
 * no puede pisar los resultados de «anabel», aunque llegue despues.
 *
 * El termino que produjo cada resultado se guarda junto a el, para no anunciar
 * «sin resultados» de una busqueda que ya no es la que esta escrita.
 */

export type RemoteSearchStatus = 'idle' | 'typing' | 'searching' | 'ready' | 'error'

type UseRemoteSearchOptions<T> = {
  /** Consulta al servidor. Normalmente una Server Action. */
  search: (term: string) => Promise<T[]>
  /** Lista que se ve antes de escribir nada (primer bloque ya cargado). */
  initialResults: T[]
  minChars: number
  debounceMs?: number
}

export type RemoteSearch<T> = {
  term: string
  onTermChange: (term: string) => void
  /** `Enter` o el boton: busca ya, sin esperar al debounce ni al minimo. */
  submitNow: () => void
  clear: () => void
  retry: () => void
  results: T[]
  status: RemoteSearchStatus
  error: string | null
  /** Falta texto para que la busqueda salga sola. */
  isBelowMinChars: boolean
  showSpinner: boolean
  /** `true` cuando la busqueda termino y no encontro nada. Nunca durante la carga. */
  isEmpty: boolean
  /** Pista lista para el campo. La pantalla puede pasar la suya en su lugar. */
  hint: string | undefined
}

export function useRemoteSearch<T>({
  search,
  initialResults,
  minChars,
  debounceMs = SEARCH_DEBOUNCE_MS,
}: UseRemoteSearchOptions<T>): RemoteSearch<T> {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<T[]>(initialResults)
  const [status, setStatus] = useState<RemoteSearchStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Numero de la ultima consulta emitida: solo su respuesta puede pintar. */
  const queryIdRef = useRef(0)
  /** Termino de la ultima consulta emitida, para no repetirla. */
  const lastQueriedRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  // `search` e `initialResults` suelen ser nuevos en cada render. Guardarlos en
  // refs mantiene estables los callbacks: si no, `run` cambiaria de identidad
  // constantemente y con el se rehariria el debounce.
  //
  // Se actualizan en un efecto y no durante el render: escribir una ref
  // mientras se renderiza rompe la idempotencia que el compilador de React da
  // por supuesta. Aqui no cuesta nada, porque solo se leen mas tarde —dentro de
  // un manejador o de una promesa—, nunca en el propio render.
  const searchRef = useRef(search)
  const initialRef = useRef(initialResults)

  useEffect(() => {
    searchRef.current = search
  }, [search])

  useEffect(() => {
    initialRef.current = initialResults
  }, [initialResults])

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const run = useCallback(
    (raw: string) => {
      cancelTimer()
      const normalized = normalizeSearchTerm(raw)

      if (normalized === '') {
        // Volver al principio: la lista inicial, sin consultar nada.
        queryIdRef.current += 1
        lastQueriedRef.current = null
        setResults(initialRef.current)
        setStatus('idle')
        setError(null)
        return
      }

      // Misma consulta que la ultima: no se repite (Paso 4). Tras un error,
      // `retry` borra este recuerdo para que el reintento si salga.
      if (normalized === lastQueriedRef.current) return

      const queryId = (queryIdRef.current += 1)
      lastQueriedRef.current = normalized
      setStatus('searching')
      setError(null)

      searchRef
        .current(normalized)
        .then((rows) => {
          // Respuesta de una consulta ya superada: se descarta entera.
          if (!mountedRef.current || queryId !== queryIdRef.current) return
          setResults(rows)
          setStatus('ready')
        })
        .catch(() => {
          if (!mountedRef.current || queryId !== queryIdRef.current) return
          // Se conserva lo que hubiera en pantalla y el termino escrito: el
          // error ofrece reintentar, no obliga a empezar de cero.
          setStatus('error')
          setError('No pudimos buscar. Revisa la conexión e inténtalo de nuevo.')
        })
    },
    [cancelTimer],
  )

  const onTermChange = useCallback(
    (next: string) => {
      setTerm(next)
      cancelTimer()
      setError(null)

      const normalized = normalizeSearchTerm(next)
      if (normalized === '') {
        run('')
        return
      }
      if (!meetsMinChars(normalized, minChars)) {
        setStatus('typing')
        return
      }

      setStatus('typing')
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        run(next)
      }, debounceMs)
    },
    [cancelTimer, debounceMs, minChars, run],
  )

  const submitNow = useCallback(() => run(term), [run, term])

  const clear = useCallback(() => {
    setTerm('')
    run('')
  }, [run])

  const retry = useCallback(() => {
    // Reintentar el mismo termino: hay que soltar el recuerdo de la ultima
    // consulta, o `run` lo tomaria por repetida y no haria nada.
    lastQueriedRef.current = null
    run(term)
  }, [run, term])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelTimer()
    }
  }, [cancelTimer])

  const showSpinner = useDelayedFlag(status === 'searching', SEARCH_SPINNER_DELAY_MS)
  const isBelowMinChars = term !== '' && !meetsMinChars(term, minChars)

  return {
    term,
    onTermChange,
    submitNow,
    clear,
    retry,
    results,
    status,
    error,
    isBelowMinChars,
    showSpinner,
    isEmpty: status === 'ready' && results.length === 0,
    hint: searchHint({ isBelowMinChars, minChars, isSearching: status === 'searching' }),
  }
}
