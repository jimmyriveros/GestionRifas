/**
 * La pagina de error del catalogo publico (BR-K15, D-196, I-114).
 *
 * Lo que tiene que cumplir quien llega por WhatsApp y encuentra un corte: saber
 * que paso y que hacer, no ver ningun detalle interno, no confundirlo con un
 * enlace que dejo de existir, y que «Reintentar» vuelva a pedir el catalogo de
 * verdad —`retry()`, no `reset()`—.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import CatalogError from '@/app/(catalogo)/catalogo/[slug]/error'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const error = Object.assign(new Error('detalle interno de Supabase'), { digest: 'digest-123' })

function html(): string {
  return renderToStaticMarkup(<CatalogError error={error} retry={() => undefined} />)
}

describe('la página de error del catálogo público', () => {
  it('dice qué pasó y qué hacer', () => {
    const markup = html()
    expect(markup).toContain('No pudimos cargar los números disponibles')
    expect(markup).toContain('Suele ser algo pasajero. Vuelve a intentarlo en unos segundos.')
    expect(markup).toContain('Reintentar')
  })

  it('no enseña el mensaje ni el digest del error', () => {
    const markup = html()
    expect(markup).not.toContain('detalle interno de Supabase')
    expect(markup).not.toContain('digest-123')
  })

  it('no se confunde con un enlace que dejó de existir (BR-K10)', () => {
    const markup = html()
    expect(markup).not.toContain('Este enlace ya no está disponible')
    expect(markup).not.toMatch(/enlace nuevo/i)
  })

  it('«Reintentar» vuelve a pedir el catálogo', async () => {
    const retry = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<CatalogError error={error} retry={retry} />))
    await act(async () => container.querySelector('button')?.click())
    expect(retry).toHaveBeenCalledTimes(1)

    await act(async () => root.unmount())
    container.remove()
  })
})
