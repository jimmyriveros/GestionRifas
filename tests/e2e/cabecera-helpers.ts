import { expect, type Locator, type Page } from '@playwright/test'

/**
 * El indicador de desarrollo de Next.js (el «N» de la esquina) se pinta encima
 * de la flecha compacta y se come el clic. En produccion no existe. Se oculta
 * solo en estas pruebas.
 */
export async function hideNextDevUi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const hide = () => {
      const el = document.querySelector('nextjs-portal')
      if (el instanceof HTMLElement) {
        el.style.setProperty('display', 'none', 'important')
        el.style.setProperty('pointer-events', 'none', 'important')
      }
    }
    const observer = new MutationObserver(hide)
    observer.observe(document.documentElement, { childList: true, subtree: true })
    hide()
  })
}

/** Cabecera fija de AppShell. */
export function appHeader(page: Page) {
  return page.locator('[data-app-header]')
}

export function compactState(page: Page) {
  return appHeader(page).locator('[data-compact-header]')
}

export function compactTitle(page: Page) {
  return appHeader(page).locator('[data-compact-title]')
}

export function compactAction(page: Page) {
  return appHeader(page).locator('[data-compact-action]')
}

/** Nombre de la organizacion en la cabecera (solo se ve bajo `md`). */
export function orgNameInHeader(page: Page) {
  return compactState(page).locator(':scope > span').first()
}

/**
 * Si la pantalla no da para sacar el PageHeader de la vista, anade altura
 * al `body` —fuera del arbol de React— para no romper la hidratacion.
 */
export async function ensurePageHeaderCanLeaveView(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('[data-e2e-scroll-spacer]').forEach((node) => node.remove())
    const header = document.querySelector('[data-tour="page-header"]')
    const sticky = document.querySelector('[data-app-header]')
    if (!header) return
    const stickyH = sticky?.getBoundingClientRect().height ?? 56
    const need =
      header.getBoundingClientRect().bottom + window.scrollY - stickyH + window.innerHeight + 48
    if (document.documentElement.scrollHeight >= need) return
    const spacer = document.createElement('div')
    spacer.setAttribute('data-e2e-scroll-spacer', '')
    spacer.style.height = `${need - document.documentElement.scrollHeight}px`
    document.body.appendChild(spacer)
  })
}

export async function scrollPageHeaderOut(page: Page): Promise<void> {
  await ensurePageHeaderCanLeaveView(page)
  await page.evaluate(async () => {
    const el = document.querySelector('[data-tour="page-header"]')
    const sticky = document.querySelector('[data-app-header]')
    if (!el) return
    const stickyH = sticky?.getBoundingClientRect().height ?? 56
    const y = el.getBoundingClientRect().bottom + window.scrollY - stickyH + 16
    document.documentElement.scrollTop = y
    window.scrollTo(0, y)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  })
  await expect(compactState(page)).toHaveAttribute('data-compact-header', 'active')
}

export async function scrollPageHeaderIn(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.scrollTop = 0
    window.scrollTo(0, 0)
  })
  await expect(compactState(page)).toHaveAttribute('data-compact-header', 'idle')
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  expect(overflow).toBe(false)
}

export async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
}

/** Activa el control sin pelear con el indicador de desarrollo de Next. */
export async function activate(locator: Locator): Promise<void> {
  await locator.evaluate((el) => {
    if (el instanceof HTMLElement) el.click()
  })
}

export async function expectReducedMotion(page: Page): Promise<void> {
  const property = await compactTitle(page).evaluate((el) => {
    const cluster = el.parentElement
    return cluster ? getComputedStyle(cluster).transitionProperty : ''
  })
  expect(property === 'none' || property === '').toBe(true)
}
