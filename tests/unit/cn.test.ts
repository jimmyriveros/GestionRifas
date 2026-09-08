import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { cn, TYPOGRAPHY_ROLES } from '@/lib/utils'

/**
 * `cn`, y el defecto que se le encontro midiendo la pantalla (I-099, D-172).
 *
 * `tailwind-merge` daba por COLOR cualquier `text-*` cuyo valor no conociera, y
 * los 14 roles tipograficos de este proyecto son extensiones de tema: no los
 * conocia. Un rol y un color en la misma lista se tomaban por lo mismo y se
 * descartaba el primero, sin error ni aviso.
 *
 * Estas pruebas fijan las cuatro responsabilidades que no pueden volver a
 * cruzarse —tipografia, color, conflicto entre roles y el Tailwind de siempre—
 * y, la primera de todas, que la lista de roles no se separe de `globals.css`.
 */

const ROLE_DECLARATION = /^\s*--text-([a-z0-9-]+):/gm

/** Los roles tal y como los declara la hoja de estilos, sin sus tres modificadores. */
function rolesEnGlobalsCss(): string[] {
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
  const found = new Set<string>()
  for (const match of css.matchAll(ROLE_DECLARATION)) {
    const name = match[1]!
    // `--text-heading-h3--line-height` y sus dos hermanos cuelgan del rol; no
    // son roles. Se reconocen por el doble guion.
    if (!name.includes('--')) found.add(name)
  }
  return [...found].sort()
}

describe('cn · la lista de roles no puede separarse del sistema de diseño', () => {
  it('coincide EXACTAMENTE con los `--text-*` de globals.css', () => {
    // Si esto falla, alguien añadió o quitó un rol tipográfico en la hoja de
    // estilos y no lo dijo aquí: ese rol volvería a comportarse como un color.
    expect([...TYPOGRAPHY_ROLES].sort()).toEqual(rolesEnGlobalsCss())
  })

  it('son los 14 estilos de texto del sistema', () => {
    expect(TYPOGRAPHY_ROLES).toHaveLength(14)
  })
})

describe('cn · tipografía y color conviven (A y B)', () => {
  it('un rol de encabezado con un color de estado conserva los dos', () => {
    const result = cn('text-heading-h3', 'text-status-success-text')
    expect(result).toContain('text-heading-h3')
    expect(result).toContain('text-status-success-text')
  })

  it('un rol de cifra con un color de dato conserva los dos', () => {
    const result = cn('text-metric-large', 'text-data-paid-foreground')
    expect(result).toContain('text-metric-large')
    expect(result).toContain('text-data-paid-foreground')
  })

  it('da igual el orden: el color primero y el rol después también conviven', () => {
    const result = cn('text-data-pending-foreground', 'text-body-small')
    expect(result).toContain('text-data-pending-foreground')
    expect(result).toContain('text-body-small')
  })

  it('los 14 roles conviven con un color, uno por uno', () => {
    for (const role of TYPOGRAPHY_ROLES) {
      const result = cn(`text-${role}`, 'text-muted-foreground')
      expect(result, `text-${role} se perdió`).toContain(`text-${role}`)
      expect(result, `el color se perdió junto a text-${role}`).toContain('text-muted-foreground')
    }
  })

  it('los tres casos reales que estaban rotos en producción vuelven a estar completos', () => {
    // Mensaje de error de formulario: se quedaba sin `text-destructive` y no
    // salía en rojo. Medido en la aplicación antes del arreglo.
    expect(cn('text-destructive text-body-small')).toBe('text-destructive text-body-small')
    // Botón: perdía su rol y salía a 16 px/400 en vez de 14 px/500.
    expect(cn('rounded-md text-label-medium', 'text-primary-foreground')).toBe(
      'rounded-md text-label-medium text-primary-foreground',
    )
    // Insignia: perdía `text-label-small` y salía a 14 px en vez de 12.
    expect(cn('rounded-full text-label-small', 'bg-primary text-primary-foreground')).toContain(
      'text-label-small',
    )
  })
})

describe('cn · dos roles tipográficos se resuelven (C)', () => {
  it('gana el último, como con dos tamaños de letra', () => {
    expect(cn('text-heading-h3', 'text-heading-h4')).toBe('text-heading-h4')
    expect(cn('text-metric-large', 'text-body-small')).toBe('text-body-small')
  })

  it('un rol y un tamaño nativo también se resuelven, en los dos órdenes', () => {
    // ANTES del arreglo los dos sobrevivían, que es un elemento con dos tamaños
    // de letra a la vez.
    expect(cn('text-heading-h3', 'text-lg')).toBe('text-lg')
    expect(cn('text-lg', 'text-heading-h3')).toBe('text-heading-h3')
  })
})

describe('cn · dos colores se resuelven como siempre (D)', () => {
  it('gana el último', () => {
    expect(cn('text-muted-foreground', 'text-data-paid-foreground')).toBe(
      'text-data-paid-foreground',
    )
    expect(cn('text-destructive', 'text-text-brand')).toBe('text-text-brand')
  })
})

describe('cn · el Tailwind de siempre no cambia (E)', () => {
  it('espaciado, tamaños nativos y display', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-sm', 'text-lg')).toBe('text-lg')
    expect(cn('hidden', 'block')).toBe('block')
    expect(cn('mt-1', 'mt-4')).toBe('mt-4')
  })

  it('un tamaño nativo y un color siguen conviviendo', () => {
    expect(cn('text-sm', 'text-muted-foreground')).toBe('text-sm text-muted-foreground')
  })

  it('un rol hereda del grupo de tamaño su choque con el interlineado', () => {
    // Es lo correcto: el rol fija su interlineado (`globals.css`). Y por eso el
    // producto pone el `leading` DESPUÉS, que es donde sobrevive.
    expect(cn('leading-none', 'text-label-medium')).toBe('text-label-medium')
    expect(cn('text-label-medium', 'leading-none')).toBe('text-label-medium leading-none')
  })
})

describe('cn · lo que no tiene nada que ver no se toca (F)', () => {
  it('conserva las clases sin conflicto, en su orden', () => {
    expect(cn('flex items-center gap-2', 'text-heading-h4', 'tabular-nums')).toBe(
      'flex items-center gap-2 text-heading-h4 tabular-nums',
    )
  })

  it('sigue aceptando lo que acepta `clsx`', () => {
    expect(cn('a', false && 'b', undefined, ['c', 'd'], { e: true, f: false })).toBe('a c d e')
  })

  it('las variantes responsivas y de contenedor no se mezclan con la clase base', () => {
    expect(cn('text-heading-h4 @min-[400px]/estado:text-heading-h3', 'text-data-paid-foreground')) //
      .toBe('text-heading-h4 @min-[400px]/estado:text-heading-h3 text-data-paid-foreground')
  })
})
