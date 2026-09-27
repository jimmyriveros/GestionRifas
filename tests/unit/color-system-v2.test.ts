import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Color System v2 (D-230): los 28 roles que añade la propuesta de Figma.
 *
 * Fija cuatro cosas, y la última es la que pedía la propia propuesta antes de
 * llevarlos a producción («Antes de mover estos tokens a producción: 1.
 * Ejecutar auditoría de contraste WCAG en Light y Dark»):
 *
 *   1. los valores son los de Figma, modo por modo;
 *   2. los tres ámbitos los declaran —un ámbito sin declarar hereda en silencio
 *      el valor de otro tema—, y Catalog lleva los de Dark;
 *   3. cada uno se exporta como `--color-*`, que es lo que genera la utilidad;
 *   4. el contraste, medido con la fórmula de WCAG 2.x sobre esos valores.
 */

const CSS = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')

/**
 * La colección «Color v2 — Proposal» de Figma (página 283:87), leída de sus
 * variables el 2026-09-27. Si Figma cambia un valor, se cambia aquí y en
 * `globals.css` a la vez.
 */
const FIGMA: Record<string, { light: string; dark: string }> = {
  'status-discovery-surface': { light: '#ede9fe', dark: '#2e1065' },
  'status-discovery-text': { light: '#4c1d95', dark: '#ddd6fe' },
  'status-discovery-border': { light: '#c4b5fd', dark: '#5b21b6' },
  'status-discovery-icon': { light: '#6d28d9', dark: '#a78bfa' },
  'status-attention-surface': { light: '#ffedd5', dark: '#431407' },
  'status-attention-text': { light: '#7c2d12', dark: '#fed7aa' },
  'status-attention-border': { light: '#fdba74', dark: '#9a3412' },
  'status-attention-icon': { light: '#c2410c', dark: '#fb923c' },
  'celebration-surface': { light: '#fef9c3', dark: '#422006' },
  'celebration-foreground': { light: '#713f12', dark: '#fef08a' },
  'celebration-border': { light: '#fde047', dark: '#854d0e' },
  'celebration-icon': { light: '#a16207', dark: '#facc15' },
  'accent-violet-surface': { light: '#f5f3ff', dark: '#2e1065' },
  'accent-violet-foreground': { light: '#6d28d9', dark: '#c4b5fd' },
  'accent-indigo-surface': { light: '#eef2ff', dark: '#1e1b4b' },
  'accent-indigo-foreground': { light: '#4338ca', dark: '#a5b4fc' },
  'accent-cyan-surface': { light: '#ecfeff', dark: '#083344' },
  'accent-cyan-foreground': { light: '#0e7490', dark: '#67e8f9' },
  'accent-orange-surface': { light: '#fff7ed', dark: '#431407' },
  'accent-orange-foreground': { light: '#c2410c', dark: '#fdba74' },
  'accent-gold-surface': { light: '#fefce8', dark: '#422006' },
  'accent-gold-foreground': { light: '#a16207', dark: '#fde047' },
  'data-category-1': { light: '#0d7d2d', dark: '#3ddc63' },
  'data-category-2': { light: '#4f46e5', dark: '#818cf8' },
  'data-category-3': { light: '#0891b2', dark: '#22d3ee' },
  'data-category-4': { light: '#7c3aed', dark: '#a78bfa' },
  'data-category-5': { light: '#ea580c', dark: '#fb923c' },
  'data-category-6': { light: '#ca8a04', dark: '#facc15' },
}
const TOKENS = Object.keys(FIGMA)

type Scope = 'light' | 'dark' | 'catalog'
const SELECTORS: Record<Scope, string> = {
  light: ':root',
  dark: '.dark',
  catalog: '.catalog-theme',
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
 * porque se va a usar en las dos.
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
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
    { fg: `data-category-${n}`, bg: 'surface-card', min: 3 },
    { fg: `data-category-${n}`, bg: 'background-default', min: 3 },
  ]),
]

/**
 * El único par que no cumple, y por eso la lista es exacta y no un «como
 * mucho»: si Figma corrige el valor, esta prueba avisa de que sobra la
 * excepción (I-172).
 */
const KNOWN_FAILURES = [
  'light · data-category-6 on surface-card',
  'light · data-category-6 on background-default',
]

describe('Color System v2 · los valores son los de Figma', () => {
  it.each(TOKENS)('--ds-%s en claro y oscuro', (token) => {
    expect(scopeTokens('light').get(token)).toBe(FIGMA[token]!.light)
    expect(scopeTokens('dark').get(token)).toBe(FIGMA[token]!.dark)
  })

  it('Catalog lleva los valores de Dark, porque la propuesta no lo define', () => {
    const catalog = scopeTokens('catalog')
    for (const token of TOKENS) expect(catalog.get(token), token).toBe(FIGMA[token]!.dark)
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

  it('mide los 28 pares en claro, oscuro y catálogo', () => {
    expect(rows).toHaveLength(PAIRS.length * 3)
  })

  it('solo falla el par conocido: data/category/6 en claro (2,94:1)', () => {
    expect(failures).toEqual(KNOWN_FAILURES)
  })

  it.each(rows.filter(([label]) => !KNOWN_FAILURES.includes(label)))(
    '%s cumple (%f ≥ %f)',
    (_label, ratio, min) => {
      expect(ratio).toBeGreaterThanOrEqual(min)
    },
  )
})

describe('Color System v2 · lo que todavía no se puede usar', () => {
  /** Todos los archivos de `src/` salvo la hoja de estilos, que lo declara. */
  function sourceFiles(): string[] {
    const root = resolve(process.cwd(), 'src')
    return readdirSync(root, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.(tsx?|css)$/.test(file) && !file.endsWith('globals.css'))
      .map((file) => join(root, file))
  }

  it('ningún componente consume data/category/6 mientras no cumpla contraste en claro (I-172)', () => {
    const consumers = sourceFiles().filter((file) =>
      readFileSync(file, 'utf8').includes('data-category-6'),
    )
    expect(consumers).toEqual([])
  })
})
