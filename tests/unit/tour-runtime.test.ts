import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hasSeenTour, markTourSeen } from '@/features/tour/storage'
import { usableSteps, waitForTour, type TargetRect } from '@/features/tour/use-tour'
import type { Tour } from '@/features/tour/tours'

/**
 * Comportamiento del recorrido que no necesita navegador de verdad: el descarte
 * de pasos sin elemento y la memoria de lo ya visto.
 *
 * jsdom no calcula posiciones —`getBoundingClientRect` devuelve ceros—, asi que
 * cada elemento de prueba declara el tamano que finge tener. Lo que se prueba es
 * la REGLA (un elemento sin tamano no sirve como paso), no el motor de layout.
 */

function mount(target: string, rect: Partial<TargetRect> = {}): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute('data-tour', target)
  const box = { top: 0, left: 0, width: 200, height: 40, ...rect }
  element.getBoundingClientRect = () =>
    ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
    }).valueOf() as DOMRect
  document.body.append(element)
  return element
}

const tour: Tour = {
  id: 'seller-dashboard',
  path: '/seller/dashboard',
  roles: ['seller'],
  steps: [
    {
      id: 'nav-sidebar',
      target: 'nav-sidebar',
      title: 'Barra lateral',
      body: 'Solo en escritorio.',
    },
    { id: 'nav-mobile', target: 'nav-mobile', title: 'Menú del teléfono', body: 'Solo en móvil.' },
    { id: 'closing', title: 'Ya puedes empezar', body: 'Sin elemento.' },
  ],
}

describe('descarte de pasos cuyo elemento no está', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('conserva los pasos cuyo elemento existe y ocupa espacio', () => {
    mount('nav-sidebar')
    mount('nav-mobile')
    expect(usableSteps(tour).map((step) => step.id)).toEqual([
      'nav-sidebar',
      'nav-mobile',
      'closing',
    ])
  })

  it('descarta el paso cuyo elemento no existe, sin romper el resto', () => {
    mount('nav-mobile')
    expect(usableSteps(tour).map((step) => step.id)).toEqual(['nav-mobile', 'closing'])
  })

  it('descarta un elemento presente pero sin tamaño: es lo que pasa en el teléfono', () => {
    mount('nav-sidebar', { width: 0, height: 0 }) // oculto bajo `md`
    mount('nav-mobile')
    expect(usableSteps(tour).map((step) => step.id)).toEqual(['nav-mobile', 'closing'])
  })

  it('descarta un elemento con visibility: hidden', () => {
    const hidden = mount('nav-sidebar')
    hidden.style.visibility = 'hidden'
    mount('nav-mobile')
    expect(usableSteps(tour).map((step) => step.id)).toEqual(['nav-mobile', 'closing'])
  })

  it('el paso de cierre sobrevive aunque no haya ningún elemento en la pantalla', () => {
    expect(usableSteps(tour).map((step) => step.id)).toEqual(['closing'])
  })
})

describe('espera a que la pantalla llegue (streaming)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('no arranca con lo que hay si todavía están llegando más elementos', async () => {
    // La barra lateral vive en el layout y ya esta; el resto llega despues.
    mount('nav-sidebar')
    const started = waitForTour(tour, { timeoutMs: 2000, settleMs: 120 })

    setTimeout(() => mount('nav-mobile'), 60)

    await expect(started).resolves.toBe(true)
    // Al resolver, los dos elementos ya cuentan: no se perdio ningun paso.
    expect(usableSteps(tour).map((step) => step.id)).toEqual([
      'nav-sidebar',
      'nav-mobile',
      'closing',
    ])
  })

  it('si la pantalla nunca trae un elemento, no arranca', async () => {
    await expect(waitForTour(tour, { timeoutMs: 150, settleMs: 40 })).resolves.toBe(false)
  })
})

describe('memoria de lo ya visto', () => {
  beforeEach(() => window.localStorage.clear())

  it('un recorrido nuevo no se ha visto', () => {
    expect(hasSeenTour('perfil-1', 'owner-dashboard')).toBe(false)
  })

  it('queda marcado tras verlo u omitirlo', () => {
    markTourSeen('perfil-1', 'owner-dashboard')
    expect(hasSeenTour('perfil-1', 'owner-dashboard')).toBe(true)
  })

  it('cada recorrido se recuerda por separado', () => {
    markTourSeen('perfil-1', 'owner-dashboard')
    expect(hasSeenTour('perfil-1', 'owner-tickets')).toBe(false)
  })

  it('cada persona se recuerda por separado en el mismo equipo', () => {
    markTourSeen('perfil-1', 'owner-dashboard')
    expect(hasSeenTour('perfil-2', 'owner-dashboard')).toBe(false)
  })

  it('si el navegador bloquea el almacenamiento, no se repite en cada visita', () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error('almacenamiento bloqueado')
    }
    try {
      expect(hasSeenTour('perfil-1', 'owner-dashboard')).toBe(true)
    } finally {
      Storage.prototype.getItem = original
    }
  })
})
