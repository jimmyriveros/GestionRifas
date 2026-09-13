/**
 * El boton «Reintentar» de las paginas de error (D-196).
 *
 * Mientras `retry()` trabaja dice «Reintentando…» y no se puede tocar otra vez:
 * un segundo toque volveria a pedir la pantalla. Al terminar recupera su texto,
 * que es lo que ve quien sigue en la pagina de error porque el reintento fallo.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import { RetryButton } from '@/components/feedback/RetryButton'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('el botón «Reintentar» de las páginas de error', () => {
  it('mientras reintenta dice «Reintentando…» y no se puede volver a tocar', async () => {
    let terminar: () => void = () => undefined
    const retry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          terminar = resolve
        }),
    )
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const boton = () => container.querySelector('button') as HTMLButtonElement

    await act(async () => root.render(<RetryButton retry={retry} />))
    expect(boton().textContent).toBe('Reintentar')

    await act(async () => boton().click())
    expect(retry).toHaveBeenCalledTimes(1)
    expect(boton().textContent).toBe('Reintentando…')
    expect(boton().disabled).toBe(true)

    await act(async () => boton().click())
    expect(retry).toHaveBeenCalledTimes(1)

    await act(async () => terminar())
    expect(boton().textContent).toBe('Reintentar')
    expect(boton().disabled).toBe(false)

    await act(async () => root.unmount())
    container.remove()
  })
})
