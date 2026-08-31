import { describe, expect, it } from 'vitest'

import { APP_HEADER_HEIGHT_PX, isPageHeaderHidden } from '@/components/layout/compact-header'

/**
 * Umbral de la cabecera contextual (D-150).
 *
 * El compacto solo puede encenderse cuando el PageHeader entero ya quedo
 * detras de la cabecera fija. Si el borde inferior todavia asoma, las dos
 * versiones del titulo se verian a la vez.
 */
describe('isPageHeaderHidden', () => {
  it('se oculta cuando el borde inferior llega al borde de la cabecera fija', () => {
    expect(isPageHeaderHidden(APP_HEADER_HEIGHT_PX, APP_HEADER_HEIGHT_PX)).toBe(true)
    expect(isPageHeaderHidden(APP_HEADER_HEIGHT_PX - 1, APP_HEADER_HEIGHT_PX)).toBe(true)
  })

  it('sigue visible mientras asoma un pixel debajo de la cabecera fija', () => {
    expect(isPageHeaderHidden(APP_HEADER_HEIGHT_PX + 1, APP_HEADER_HEIGHT_PX)).toBe(false)
    expect(isPageHeaderHidden(240, APP_HEADER_HEIGHT_PX)).toBe(false)
  })

  it('usa la altura recibida, no una cifra escrita en la llamada', () => {
    expect(isPageHeaderHidden(40, 40)).toBe(true)
    expect(isPageHeaderHidden(41, 40)).toBe(false)
  })
})
