import { describe, expect, it } from 'vitest'

import { isNavItemActive } from '@/components/layout/nav-active'

/**
 * Que entrada del menu se enciende en cada pantalla (D-106).
 *
 * La regla la comparten la barra lateral de escritorio y la barra inferior del
 * telefono, asi que probarla una vez basta para las dos. Lo que se comprueba no
 * es que dos cadenas se parezcan, sino lo que espera quien navega: si entre a
 * una boleta desde «Boletas», «Boletas» sigue siendo donde estoy.
 */
describe('isNavItemActive', () => {
  it('enciende la entrada de la propia pantalla', () => {
    expect(isNavItemActive('/seller/tickets', '/seller/tickets')).toBe(true)
  })

  it('sigue encendida en el detalle de una boleta', () => {
    expect(isNavItemActive('/seller/tickets/8f3c-1a2b', '/seller/tickets')).toBe(true)
    expect(isNavItemActive('/owner/tickets/bulk', '/owner/tickets')).toBe(true)
    expect(isNavItemActive('/owner/clients/44/', '/owner/clients')).toBe(true)
  })

  it('no se contagia entre portales ni entre modulos', () => {
    expect(isNavItemActive('/owner/tickets', '/seller/tickets')).toBe(false)
    expect(isNavItemActive('/seller/clients', '/seller/tickets')).toBe(false)
  })

  /**
   * El separador es obligatorio. Sin el, `/seller/ticketsXYZ` —o una ruta futura
   * que empiece igual, como `/owner/reports-v2`— encenderia la entrada
   * equivocada y nadie se daria cuenta hasta verlo en un telefono.
   */
  it('exige el separador y no solo que la ruta empiece igual', () => {
    expect(isNavItemActive('/seller/ticketsXYZ', '/seller/tickets')).toBe(false)
    expect(isNavItemActive('/owner/reports-v2', '/owner/reports')).toBe(false)
  })

  it('deja el panel apagado cuando se esta en otro modulo', () => {
    expect(isNavItemActive('/seller/team', '/seller/dashboard')).toBe(false)
  })
})
