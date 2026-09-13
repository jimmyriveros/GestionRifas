/**
 * La pagina de error general (D-196).
 *
 * Lo que se comprueba: dice que paso y que hacer, no enseña el mensaje ni el
 * digest del error, y «Reintentar» llama a `retry()` —que vuelve a pedir la
 * pantalla— y no a `reset()`, que en esta version de Next repinta sin pedir nada.
 * No hay Testing Library: se monta con `react-dom/client` y `act`, como
 * `catalog-error-page.test.tsx`.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import GlobalError from '@/app/error'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const error = Object.assign(new Error('detalle interno de PostgreSQL'), { digest: 'digest-456' })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('la página de error general', () => {
  it('dice qué pasó y ofrece reintentar, sin detalles internos', () => {
    const markup = renderToStaticMarkup(<GlobalError error={error} retry={() => undefined} />)

    expect(markup).toContain('Algo salió mal')
    expect(markup).toContain('Ocurrió un error inesperado. Intenta de nuevo.')
    expect(markup).toContain('Reintentar')
    expect(markup).not.toContain('detalle interno de PostgreSQL')
    expect(markup).not.toContain('digest-456')
  })

  it('«Reintentar» vuelve a pedir la pantalla con retry()', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const retry = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<GlobalError error={error} retry={retry} />))
    await act(async () => container.querySelector('button')?.click())

    expect(retry).toHaveBeenCalledTimes(1)
    // El error se sigue anotando en la consola del navegador, como antes.
    expect(consola).toHaveBeenCalledWith(error)

    await act(async () => root.unmount())
    container.remove()
  })
})
