import { describe, expect, it } from 'vitest'

import { findTour, TOURS, tourSelector, tourTarget } from '@/features/tour/tours'

/**
 * Configuracion del recorrido guiado.
 *
 * Son las invariantes que hacen que agregar o reordenar un paso sea seguro: no
 * comprueban como se ve, sino que la configuracion sea coherente.
 */

describe('configuracion de los recorridos', () => {
  it('cada recorrido tiene un id unico', () => {
    const ids = TOURS.map((tour) => tour.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('los pasos de un recorrido tienen ids unicos y estables', () => {
    for (const tour of TOURS) {
      const ids = tour.steps.map((step) => step.id)
      expect(new Set(ids).size, `ids repetidos en ${tour.id}`).toBe(ids.length)
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('todo recorrido termina con el mensaje de cierre y sin elemento', () => {
    for (const tour of TOURS) {
      const last = tour.steps.at(-1)!
      expect(last.id, `el ultimo paso de ${tour.id}`).toBe('closing')
      expect(last.target).toBeUndefined()
      expect(last.body).toContain('Ver recorrido guiado')
    }
  })

  it('ningun recorrido se queda en un solo paso', () => {
    for (const tour of TOURS) expect(tour.steps.length, tour.id).toBeGreaterThan(1)
  })

  it('cada recorrido declara los roles que lo ven', () => {
    for (const tour of TOURS) expect(tour.roles.length, tour.id).toBeGreaterThan(0)
  })

  it('los recorridos del portal administrativo no son para vendedores, y al reves', () => {
    for (const tour of TOURS) {
      if (tour.path.startsWith('/owner/')) {
        expect(tour.roles, tour.id).toEqual(['owner', 'admin'])
      } else {
        expect(tour.roles, tour.id).toEqual(['seller'])
      }
    }
  })

  it('no hay dos recorridos para la misma ruta y rol', () => {
    const seen = new Set<string>()
    for (const tour of TOURS) {
      for (const role of tour.roles) {
        const key = `${tour.path}|${role}`
        expect(seen.has(key), `${key} duplicado`).toBe(false)
        seen.add(key)
      }
    }
  })
})

describe('textos del recorrido (docs/UX_COPY_GUIDELINES.md 13)', () => {
  const steps = TOURS.flatMap((tour) => tour.steps.map((step) => ({ tour: tour.id, step })))

  it('los titulos tienen entre 2 y 7 palabras', () => {
    for (const { tour, step } of steps) {
      const words = step.title.trim().split(/\s+/).length
      expect(words, `«${step.title}» en ${tour}`).toBeGreaterThanOrEqual(2)
      expect(words, `«${step.title}» en ${tour}`).toBeLessThanOrEqual(7)
    }
  })

  it('la explicacion no pasa de tres frases', () => {
    for (const { tour, step } of steps) {
      const sentences = step.body.split(/[.!?]+\s/).filter(Boolean).length
      expect(sentences, `${step.id} en ${tour}`).toBeLessThanOrEqual(3)
    }
  })

  it('usan el glosario: nunca «ticket», «owner» ni «comprador»', () => {
    const prohibidas = /\b(ticket|tickets|owner|comprador|compradores|admin|sorteo|campa[nñ]a)\b/i
    for (const { tour, step } of steps) {
      expect(prohibidas.test(step.title), `titulo de ${step.id} en ${tour}`).toBe(false)
      expect(prohibidas.test(step.body), `texto de ${step.id} en ${tour}`).toBe(false)
    }
  })

  it('tutean: nunca hablan de usted', () => {
    const usted = /\b(usted|ustedes|seleccione|ingrese|revise|haga|pulse|toque el|dirijase)\b/i
    for (const { tour, step } of steps) {
      expect(usted.test(`${step.title} ${step.body}`), `${step.id} en ${tour}`).toBe(false)
    }
  })
})

describe('findTour', () => {
  it('encuentra el recorrido de la ruta exacta', () => {
    expect(findTour('/owner/dashboard', 'owner')?.id).toBe('owner-dashboard')
    expect(findTour('/seller/tickets', 'seller')?.id).toBe('seller-tickets')
  })

  it('un administrador ve los recorridos del portal administrativo', () => {
    expect(findTour('/owner/dashboard', 'admin')?.id).toBe('owner-dashboard')
  })

  it('un vendedor no recibe el recorrido del portal administrativo', () => {
    expect(findTour('/owner/dashboard', 'seller')).toBeNull()
  })

  it('una subruta no hereda el recorrido de su seccion', () => {
    expect(findTour('/owner/tickets/bulk', 'owner')).toBeNull()
    expect(findTour('/owner/tickets/abc-123', 'owner')).toBeNull()
  })

  it('una pantalla sin recorrido devuelve null', () => {
    expect(findTour('/account/password', 'owner')).toBeNull()
  })
})

describe('marcado de elementos', () => {
  it('produce el atributo y el selector que se corresponden', () => {
    expect(tourTarget('filters')).toEqual({ 'data-tour': 'filters' })
    expect(tourSelector('filters')).toBe('[data-tour="filters"]')
  })
})
