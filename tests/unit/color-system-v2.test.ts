import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Color System v2 (D-230, cerrado en D-232): los roles que añade la propuesta
 * de Figma, y los cuatro de `accent/indigo` que suma D-233 para los números
 * de la boleta.
 *
 * Fija cinco cosas, y la última es la que pedía la propia propuesta antes de
 * llevarlos a producción («Antes de mover estos tokens a producción: 1.
 * Ejecutar auditoría de contraste WCAG en Light y Dark»):
 *
 *   1. cada rol es, modo por modo, el alias de una primitiva de Figma, y aquí
 *      se escribe el valor literal de esa primitiva;
 *   2. los tres ámbitos los declaran —un ámbito sin declarar hereda en silencio
 *      el valor de otro tema—, y Catalog lleva los de Dark;
 *   3. cada uno se exporta como `--color-*`, que es lo que genera la utilidad;
 *   4. ninguna primitiva se exporta;
 *   5. el contraste, medido con la fórmula de WCAG 2.x sobre esos valores, y
 *      sin excepciones desde D-232.
 */

const CSS = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')

/**
 * Las primitivas de Figma que usan estos roles, con su valor. Las rampas son de
 * «Primitives v2 — Proposal»; `brand`, de «Primitives». Solo las que algún rol
 * aliasea: una primitiva que ningún rol usa no tiene nada que comprobar aquí.
 */
const PRIMITIVES: Record<string, string> = {
  'violet/50': '#f5f3ff',
  'violet/100': '#ede9fe',
  'violet/200': '#ddd6fe',
  'violet/300': '#c4b5fd',
  'violet/400': '#a78bfa',
  'violet/600': '#7c3aed',
  'violet/700': '#6d28d9',
  'violet/800': '#5b21b6',
  'violet/900': '#4c1d95',
  'violet/950': '#2e1065',
  'indigo/50': '#eef2ff',
  'indigo/100': '#e0e7ff',
  'indigo/200': '#c7d2fe',
  'indigo/300': '#a5b4fc',
  'indigo/400': '#818cf8',
  'indigo/600': '#4f46e5',
  'indigo/700': '#4338ca',
  'indigo/800': '#3730a3',
  'indigo/900': '#312e81',
  'indigo/950': '#1e1b4b',
  'cyan/50': '#ecfeff',
  'cyan/300': '#67e8f9',
  'cyan/400': '#22d3ee',
  'cyan/600': '#0891b2',
  'cyan/700': '#0e7490',
  'cyan/950': '#083344',
  'orange/50': '#fff7ed',
  'orange/100': '#ffedd5',
  'orange/200': '#fed7aa',
  'orange/300': '#fdba74',
  'orange/400': '#fb923c',
  'orange/600': '#ea580c',
  'orange/700': '#c2410c',
  'orange/800': '#9a3412',
  'orange/900': '#7c2d12',
  'orange/950': '#431407',
  'gold/50': '#fefce8',
  'gold/100': '#fef9c3',
  'gold/200': '#fef08a',
  'gold/300': '#fde047',
  'gold/400': '#facc15',
  'gold/700': '#a16207',
  'gold/800': '#854d0e',
  'gold/900': '#713f12',
  'gold/950': '#422006',
  'brand/400': '#3ddc63',
  'brand/700': '#0d7d2d',
}

/**
 * La colección «Color v2 — Proposal» de Figma (página 283:87): de qué primitiva
 * es alias cada rol, en Light y en Dark. Catalog aliasea las mismas que Dark
 * (D-232). Leída de sus variables el 2026-09-27; si Figma cambia un alias, se
 * cambia aquí y en `globals.css` a la vez.
 */
const ROLES: Record<string, { light: string; dark: string }> = {
  'status-discovery-surface': { light: 'violet/100', dark: 'violet/950' },
  'status-discovery-text': { light: 'violet/900', dark: 'violet/200' },
  'status-discovery-border': { light: 'violet/300', dark: 'violet/800' },
  'status-discovery-icon': { light: 'violet/700', dark: 'violet/400' },
  'status-attention-surface': { light: 'orange/100', dark: 'orange/950' },
  'status-attention-text': { light: 'orange/900', dark: 'orange/200' },
  'status-attention-border': { light: 'orange/300', dark: 'orange/800' },
  'status-attention-icon': { light: 'orange/700', dark: 'orange/400' },
  'celebration-surface': { light: 'gold/100', dark: 'gold/950' },
  'celebration-foreground': { light: 'gold/900', dark: 'gold/200' },
  'celebration-border': { light: 'gold/300', dark: 'gold/800' },
  'celebration-icon': { light: 'gold/700', dark: 'gold/400' },
  'accent-violet-surface': { light: 'violet/50', dark: 'violet/950' },
  'accent-violet-foreground': { light: 'violet/700', dark: 'violet/300' },
  'accent-indigo-surface': { light: 'indigo/50', dark: 'indigo/950' },
  'accent-indigo-foreground': { light: 'indigo/700', dark: 'indigo/300' },
  // Los dos tonos de los números de la boleta (D-233): el diario usa
  // surface-strong, foreground y border-strong; el semanal, surface,
  // foreground-subtle y border.
  'accent-indigo-surface-strong': { light: 'indigo/100', dark: 'indigo/900' },
  'accent-indigo-foreground-subtle': { light: 'indigo/600', dark: 'indigo/400' },
  'accent-indigo-border': { light: 'indigo/200', dark: 'indigo/800' },
  'accent-indigo-border-strong': { light: 'indigo/300', dark: 'indigo/600' },
  'accent-cyan-surface': { light: 'cyan/50', dark: 'cyan/950' },
  'accent-cyan-foreground': { light: 'cyan/700', dark: 'cyan/300' },
  'accent-orange-surface': { light: 'orange/50', dark: 'orange/950' },
  'accent-orange-foreground': { light: 'orange/700', dark: 'orange/300' },
  'accent-gold-surface': { light: 'gold/50', dark: 'gold/950' },
  'accent-gold-foreground': { light: 'gold/700', dark: 'gold/300' },
  'data-category-1': { light: 'brand/700', dark: 'brand/400' },
  'data-category-2': { light: 'indigo/600', dark: 'indigo/400' },
  'data-category-3': { light: 'cyan/600', dark: 'cyan/400' },
  'data-category-4': { light: 'violet/600', dark: 'violet/400' },
  'data-category-5': { light: 'orange/600', dark: 'orange/400' },
  'data-category-6': { light: 'gold/700', dark: 'gold/400' },
}
const TOKENS = Object.keys(ROLES)

type Scope = 'light' | 'dark' | 'catalog'
const SELECTORS: Record<Scope, string> = {
  light: ':root',
  dark: '.dark',
  catalog: '.catalog-theme',
}

/** El valor que le toca a un rol en un ámbito: el de su primitiva. */
function expected(token: string, scope: Scope): string {
  const role = ROLES[token]!
  return PRIMITIVES[scope === 'light' ? role.light : role.dark]!
}

/**
 * Las declaraciones `--ds-*` de un ámbito, sumando TODOS sus bloques de primer
 * nivel en el orden del archivo (el último gana, como en la cascada). Los
 * bloques anidados —`@media`, `@layer`— van sangrados y no entran: ninguno
 * declara colores del sistema.
 */
function scopeTokens(scope: Scope): Map<string, string> {
  const selector = SELECTORS[scope].replace('.', '\\.')
  const blocks = new RegExp(`^${selector} \\{([\\s\\S]*?)^\\}`, 'gm')
  const found = new Map<string, string>()
  for (const block of CSS.matchAll(blocks)) {
    for (const declaration of block[1]!.matchAll(/--ds-([a-z0-9-]+):\s*([^;]+);/g)) {
      found.set(declaration[1]!, declaration[2]!.trim().toLowerCase())
    }
  }
  return found
}

/**
 * Resuelve `var(--ds-x)` dentro del mismo ámbito hasta llegar a un color.
 * `null` si el ámbito no lo declara: la prueba lo cuenta como fallo, no revienta
 * al recolectarse.
 */
function resolveToken(tokens: Map<string, string>, name: string): string | null {
  let value = tokens.get(name)
  for (let depth = 0; value?.startsWith('var(') && depth < 5; depth++) {
    value = tokens.get(value.slice('var(--ds-'.length, -1))
  }
  return value?.startsWith('#') ? value : null
}

/** Luminancia relativa y contraste, tal y como los define WCAG 2.x. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

/**
 * Qué se mide contra qué. Texto 4,5:1 (1.4.3); iconos y series de un gráfico,
 * 3:1 (1.4.11). Un acento se mide contra su superficie y contra la tarjeta,
 * porque se va a usar en las dos. Los números de la boleta (D-233), con el
 * texto de cada tono sobre su propio fondo.
 */
const PAIRS: Array<{ fg: string; bg: string; min: number }> = [
  { fg: 'status-discovery-text', bg: 'status-discovery-surface', min: 4.5 },
  { fg: 'status-discovery-icon', bg: 'status-discovery-surface', min: 3 },
  { fg: 'status-attention-text', bg: 'status-attention-surface', min: 4.5 },
  { fg: 'status-attention-icon', bg: 'status-attention-surface', min: 3 },
  { fg: 'celebration-foreground', bg: 'celebration-surface', min: 4.5 },
  { fg: 'celebration-icon', bg: 'celebration-surface', min: 3 },
  ...['violet', 'indigo', 'cyan', 'orange', 'gold'].flatMap((family) => [
    { fg: `accent-${family}-foreground`, bg: `accent-${family}-surface`, min: 4.5 },
    { fg: `accent-${family}-foreground`, bg: 'surface-card', min: 4.5 },
  ]),
  { fg: 'accent-indigo-foreground', bg: 'accent-indigo-surface-strong', min: 4.5 },
  { fg: 'accent-indigo-foreground-subtle', bg: 'accent-indigo-surface', min: 4.5 },
  { fg: 'accent-indigo-foreground-subtle', bg: 'surface-card', min: 4.5 },
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
    { fg: `data-category-${n}`, bg: 'surface-card', min: 3 },
    { fg: `data-category-${n}`, bg: 'background-default', min: 3 },
  ]),
]

describe('Color System v2 · cada rol es el valor de su primitiva de Figma', () => {
  it.each(TOKENS)('--ds-%s en claro y oscuro', (token) => {
    expect(scopeTokens('light').get(token)).toBe(expected(token, 'light'))
    expect(scopeTokens('dark').get(token)).toBe(expected(token, 'dark'))
  })

  it('Catalog lleva los valores de Dark, como el modo «Catalog» de Figma (D-232)', () => {
    const catalog = scopeTokens('catalog')
    for (const token of TOKENS) expect(catalog.get(token), token).toBe(expected(token, 'catalog'))
  })

  it('data/category/6 en claro es gold/700: el único valor que cambió respecto de la propuesta (D-232)', () => {
    expect(ROLES['data-category-6']!.light).toBe('gold/700')
    expect(scopeTokens('light').get('data-category-6')).toBe('#a16207')
    // Los demás dorados, como estaban.
    expect(scopeTokens('light').get('celebration-icon')).toBe('#a16207')
    expect(scopeTokens('light').get('accent-gold-foreground')).toBe('#a16207')
    expect(scopeTokens('dark').get('data-category-6')).toBe('#facc15')
  })

  it('el número diario y el semanal tienen tonos distintos en los tres ámbitos (D-233)', () => {
    for (const scope of ['light', 'dark', 'catalog'] as const) {
      const tokens = scopeTokens(scope)
      const diario = ['surface-strong', 'foreground', 'border-strong'].map((r) =>
        tokens.get(`accent-indigo-${r}`),
      )
      const semanal = ['surface', 'foreground-subtle', 'border'].map((r) =>
        tokens.get(`accent-indigo-${r}`),
      )
      diario.forEach((valor, i) => expect(valor, scope).not.toBe(semanal[i]))
    }
  })

  it('cada rol se exporta como --color-*, que es lo que genera la utilidad', () => {
    for (const token of TOKENS) {
      expect(CSS, token).toContain(`--color-${token}: var(--ds-${token});`)
    }
  })

  it('no se exporta ninguna primitiva nueva (violet, indigo, cyan, orange, gold)', () => {
    expect(CSS).not.toMatch(/--(?:ds|color)-(?:violet|indigo|cyan|orange|gold)-\d{2,3}\s*:/)
  })
})

describe('Color System v2 · auditoría de contraste WCAG en los tres ámbitos', () => {
  const failures: string[] = []
  const rows: Array<[string, number, number]> = []
  for (const scope of ['light', 'dark', 'catalog'] as const) {
    const tokens = scopeTokens(scope)
    for (const pair of PAIRS) {
      const fg = resolveToken(tokens, pair.fg)
      const bg = resolveToken(tokens, pair.bg)
      const label = `${scope} · ${pair.fg} on ${pair.bg}`
      // Sin valor no hay contraste que medir: cuenta como fallo, con su nombre.
      const ratio = fg && bg ? contrast(fg, bg) : Number.NaN
      rows.push([label, ratio, pair.min])
      if (!(ratio >= pair.min)) failures.push(label)
    }
  }

  it(`mide los ${PAIRS.length} pares en claro, oscuro y catálogo`, () => {
    expect(rows).toHaveLength(PAIRS.length * 3)
  })

  it('todos cumplen, sin excepciones: la de data/category/6 en claro se cerró en D-232 (I-172)', () => {
    expect(failures).toEqual([])
  })

  it.each(rows)('%s cumple (%f ≥ %f)', (_label, ratio, min) => {
    expect(ratio).toBeGreaterThanOrEqual(min)
  })
})
