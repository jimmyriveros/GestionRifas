'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'

import { searchParamsToBuildOn } from '@/lib/navigation-start'

/**
 * Un enlace de página del catálogo público que conserva una búsqueda EN CAMINO (I-200, D-252).
 *
 * La paginación del catálogo son enlaces a propósito —funcionan sin JavaScript, se abren en otra pestaña y el
 * navegador los precarga—, y su dirección se calcula al pintar, con la búsqueda que ya estaba en la página. Si el
 * visitante escribe otro número y pulsa «Siguiente» mientras esa búsqueda todavía no llegó, el enlace la sustituía.
 *
 * Aquí el `href` no cambia. `onNavigate` solo actúa en la navegación de la aplicación —no al abrir en otra pestaña ni
 * sin JavaScript—, y solo si hay una navegación de esta pantalla en camino: entonces va a esa página SOBRE la última
 * dirección pedida (`searchParamsToBuildOn`, la misma de las listas). Si no, el enlace va donde dice.
 */
export function CatalogPageLink({
  page,
  ...props
}: Omit<ComponentProps<typeof Link>, 'onNavigate'> & { page: number }) {
  const router = useRouter()

  return (
    <Link
      {...props}
      onNavigate={(event) => {
        const { pathname, search } = window.location
        const painted = new URLSearchParams(search)
        const base = searchParamsToBuildOn(pathname, painted)
        if (base.toString() === painted.toString()) return
        event.preventDefault()
        if (page > 1) base.set('page', String(page))
        else base.delete('page')
        const query = base.toString()
        router.push(query ? `${pathname}?${query}` : pathname)
      }}
    />
  )
}
