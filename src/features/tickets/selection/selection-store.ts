'use client'

import { BULK_SELECTION_MAX } from '@/lib/constants'

/**
 * Donde vive la lista de boletas seleccionadas.
 *
 * Es un almacen externo a React —`sessionStorage` con una cache en memoria— y
 * se lee con `useSyncExternalStore`. No es una floritura: es lo que permite
 * cumplir dos cosas a la vez que, con `useState`, se pelean.
 *
 * 1. LA SELECCION SOBREVIVE (seccion 11 del encargo). Buscar, filtrar, ordenar
 *    o cambiar de pagina no la pierde, y una recarga tampoco. Si dependiera de
 *    estado de React, cualquier desmontaje —un `loading.tsx` que se interponga,
 *    una recarga— la borraria sin avisar.
 * 2. NO ROMPE LA HIDRATACION. El servidor no tiene `sessionStorage`, asi que
 *    `getServerSnapshot` devuelve la lista vacia y React vuelve a renderizar con
 *    lo guardado en cuanto esta en el navegador. Leerlo desde un efecto haria lo
 *    mismo, pero con un render de mas y un parpadeo.
 *
 * `sessionStorage` y no `localStorage`: muere con la pestana, asi que la
 * seleccion no persiste entre sesiones del navegador (seccion 13).
 *
 * Si el almacenamiento falla —modo privado, cuota llena—, la cache en memoria
 * sigue funcionando: se pierde la resistencia a la recarga, no la funcion.
 */

const PREFIX = 'rifas.ticket-selection:'

/** Misma referencia siempre: `useSyncExternalStore` entra en bucle si cada
 *  lectura devuelve un array nuevo. */
const EMPTY: string[] = []

const cache = new Map<string, { raw: string; value: string[] }>()
const listeners = new Map<string, Set<() => void>>()

function parse(raw: string | null): string[] {
  if (!raw) return EMPTY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY
    const ids = parsed.filter((id): id is string => typeof id === 'string')
    return ids.length === 0 ? EMPTY : ids.slice(0, BULK_SELECTION_MAX)
  } catch {
    return EMPTY
  }
}

export function readSelection(key: string): string[] {
  const cached = cache.get(key)
  if (typeof window === 'undefined') return cached?.value ?? EMPTY

  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(PREFIX + key)
  } catch {
    return cached?.value ?? EMPTY
  }

  if (cached && cached.raw === (raw ?? '')) return cached.value
  const value = parse(raw)
  cache.set(key, { raw: raw ?? '', value })
  return value
}

export function writeSelection(key: string, ids: string[]): void {
  const next = ids.length === 0 ? EMPTY : ids
  const raw = next.length === 0 ? '' : JSON.stringify(next)
  cache.set(key, { raw, value: next })

  if (typeof window !== 'undefined') {
    try {
      if (next.length === 0) window.sessionStorage.removeItem(PREFIX + key)
      else window.sessionStorage.setItem(PREFIX + key, raw)
    } catch {
      // Sin almacenamiento la seleccion vive solo en memoria. Funciona igual;
      // lo unico que se pierde es sobrevivir a una recarga.
    }
  }

  for (const listener of listeners.get(key) ?? []) listener()
}

export function subscribeSelection(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set()
  set.add(listener)
  listeners.set(key, set)
  return () => {
    set.delete(listener)
  }
}

/** Lo que ve el servidor: nunca hay nada seleccionado todavia. */
export function emptySelection(): string[] {
  return EMPTY
}
