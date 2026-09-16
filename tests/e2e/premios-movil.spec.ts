import { expect, test, type Locator, type Page } from '@playwright/test'

import { loadSeedRefs, signedInClient } from './db-setup'
import { ACCOUNTS, addPrize, createRaffleWithPrize, loginAs, unique } from './fixtures'

/**
 * El panel de premios en el viewport del teléfono (Entrega 2, D-202).
 *
 * Escritorio vive en `premios.spec.ts`. Aquí se comprueba lo que solo se puede
 * comprobar con un ancho de verdad: que la tabla NO se encoge —debajo de `md`
 * cada premio es una tarjeta—, que a 320, 375, 390 y 430 px no se desborda
 * nada, y que las acciones y el formulario se pueden tocar con el pulgar.
 */

const ANCHOS = [320, 375, 390, 430] as const

/** El suelo de la diana táctil, en px (CLAUDE.md §27). */
const DIANA = 44

async function desbordamiento(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('Premios en el teléfono', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('cada premio es una tarjeta, no una tabla encogida', async ({ page }) => {
    const name = unique('Rifa movil')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio del teléfono' })

    // La tabla existe en el DOM pero no se ve: debajo de `md` manda la tarjeta.
    await expect(page.getByRole('table')).toBeHidden()

    const tarjeta = page.getByRole('article').first()
    await expect(tarjeta).toBeVisible()
    await expect(tarjeta).toContainText('Premio del teléfono')
    await expect(tarjeta).toContainText('$500.000')
    await expect(tarjeta).toContainText('Vigente')
    // La misma información y en el mismo orden semántico que la tabla.
    await expect(tarjeta).toContainText('Número')
    await expect(tarjeta).toContainText('Cifras')
    await expect(tarjeta).toContainText('Vigencia')
    await expect(tarjeta).toContainText('Lotería')
  })

  test('no hay desbordamiento horizontal en ninguno de los cuatro anchos', async ({ page }) => {
    const name = unique('Rifa anchos')
    await createRaffleWithPrize(page, {
      name,
      prizeTitle: 'Premio con un nombre bastante largo para probar el ancho',
    })
    await addPrize(page, { title: 'Premio dos', amount: '1200000', date: '2026-01-02' })

    for (const width of ANCHOS) {
      await page.setViewportSize({ width, height: 800 })
      await page.reload()
      await expect(page.getByRole('article').first()).toBeVisible()
      expect(await desbordamiento(page), `panel a ${width} px`).toBeLessThanOrEqual(0)
    }
  })

  test('el formulario del premio se puede usar y guardar con el pulgar', async ({ page }) => {
    const name = unique('Rifa formulario movil')
    await createRaffleWithPrize(page, { name, prizeTitle: 'Premio base' })

    await page.setViewportSize({ width: 320, height: 800 })
    await page.reload()

    await page.getByRole('button', { name: 'Agregar premio' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Sin desbordamiento con el diálogo abierto: es lo que más contenido lleva.
    expect(await desbordamiento(page), 'diálogo a 320 px').toBeLessThanOrEqual(0)

    // Las dianas de verdad: el botón de guardar y el de agregar un período.
    for (const boton of [
      dialog.getByRole('button', { name: 'Guardar premio' }),
      dialog.getByRole('button', { name: 'Agregar otro período' }),
    ]) {
      const alto = await boton.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).height),
      )
      expect(alto).toBeGreaterThanOrEqual(44)
    }

    await dialog.getByLabel('Nombre del premio').fill('Premio del pulgar')
    await dialog.getByLabel('Dinero').fill('400000')
    await dialog.getByLabel('Fecha', { exact: true }).fill('2026-01-02')
    await dialog.getByRole('button', { name: 'Guardar premio' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByRole('article').filter({ hasText: 'Premio del pulgar' })).toBeVisible()
  })
})

// =============================================================================
/**
 * Lo más cargado del proceso, en LOS CUATRO ANCHOS: el formulario completo —el
 * premio mayor con cuatro alternativas y tres períodos—, el historial, las dos
 * confirmaciones y la revisión (D-202).
 *
 * PARAMETRIZADA Y ACOTADA. La rifa y sus premios se preparan UNA vez, por las
 * RPC de verdad y con la sesión real del Dueño (`signedInClient`): lo que aquí
 * se prueba es la geometría, no el alta, que ya recorren por la interfaz las
 * pruebas de arriba y `premios.spec.ts`. Cada ancho abre, mide y cierra sin
 * guardar nada, así que los cuatro miran exactamente lo mismo.
 *
 * TRES COSAS SE MIDEN, y ninguna es «que se vea bonito»:
 *   1. Nada se desborda: ni el documento ni el diálogo, y ningún control se sale
 *      de la caja del diálogo.
 *   2. Toda diana mide al menos 44 × 44 —botones, desplegables, campos y las
 *      casillas de los días—, con la hoja de estilos y no con la caja, que miente
 *      mientras el diálogo entra con `zoom-in-95` (D-178).
 *   3. Las acciones principales se alcanzan: desplazando si hace falta, quedan
 *      dentro de la ventana, también a lo ancho.
 */
test.describe('Premios en el teléfono: formulario, historial, revisión y confirmaciones', () => {
  let raffleId = ''

  test.beforeAll(async () => {
    const refs = await loadSeedRefs()
    const owner = await signedInClient(ACCOUNTS.owner)

    const { data: raffle, error } = await owner
      .from('raffles')
      .insert({
        organization_id: refs.organizationId,
        name: unique('Rifa anchos premios'),
        ticket_price: 120_000,
        start_date: '2026-11-02',
        end_date: '2026-12-31',
        created_by: refs.ownerId,
        prize_mode: 'configurable',
      })
      .select('id')
      .single()
    if (error) throw error
    raffleId = raffle.id

    // El premio mayor: cuatro alternativas y tres períodos, uno de cada forma.
    const mayor = await owner.rpc('create_raffle_prize', {
      p_raffle_id: raffleId,
      p_title: 'Premio mayor',
      p_category: 'main',
      p_reward_mode: 'winner_choice',
      p_reward_options: [
        { description: 'Camioneta KIA', amount: null },
        { description: 'Renault Alaskan 2023', amount: 20_000_000 },
        { description: null, amount: 120_000_000 },
        { description: 'Renault Logan Zen público 2023', amount: 70_000_000 },
      ],
      p_number_field: 'weekly_number',
      p_digits: 'four',
      p_rules: [
        rule('2026-11-02', '2026-11-06', [1, 2, 3, 4, 5]),
        rule('2026-11-09', '2026-11-28', [6]),
        rule('2026-12-21', '2026-12-21', [1]),
      ],
      p_conditions: 'El cliente elige una sola alternativa al reclamar el premio.',
    })
    if (mayor.error) throw mayor.error

    // Un premio con historia: dos versiones.
    const diario = await owner.rpc('create_raffle_prize', {
      p_raffle_id: raffleId,
      p_title: 'Premio diario',
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: [{ description: null, amount: 500_000 }],
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [rule('2026-11-03', '2026-11-03', [2])],
    })
    if (diario.error) throw diario.error
    const creado = diario.data![0]!

    const editado = await owner.rpc('publish_raffle_prize_version', {
      p_prize_id: creado.prize_id,
      p_expected_version_id: creado.version_id,
      p_title: 'Premio diario',
      p_category: 'daily',
      p_reward_mode: 'fixed',
      p_reward_options: [{ description: null, amount: 600_000 }],
      p_number_field: 'daily_number',
      p_digits: 'four',
      p_rules: [rule('2026-11-03', '2026-11-03', [2])],
    })
    if (editado.error) throw editado.error
  })

  for (const width of ANCHOS) {
    test(`a ${width} px todo cabe y se puede tocar`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await loginAs(page, ACCOUNTS.owner)

      // ---- El panel ----------------------------------------------------------
      await page.goto(`/owner/raffles/${raffleId}/prizes`)
      const mayor = page.getByRole('article').filter({ hasText: 'Premio mayor' })
      const diario = page.getByRole('article').filter({ hasText: 'Premio diario' })
      await expect(mayor).toBeVisible()
      expect(await desbordamiento(page), `panel a ${width} px`).toBeLessThanOrEqual(0)
      await expectTargets(mayor, `tarjeta a ${width} px`)
      for (const accion of [
        page.getByRole('link', { name: 'Continuar a revisar' }),
        page.getByRole('link', { name: 'Volver a los datos de la rifa' }),
      ]) {
        await expectReachable(page, accion, `panel a ${width} px`)
        await expectTargets(accion, `panel a ${width} px`)
      }

      // ---- El formulario completo: cuatro alternativas y tres períodos -------
      await mayor.getByRole('button', { name: 'Editar' }).click()
      const formulario = await openedDialog(page.getByRole('dialog'))
      await expect(formulario.getByLabel('Qué se entrega')).toHaveCount(4)
      await expect(formulario.getByText('Período 3', { exact: true })).toBeAttached()
      await expect(formulario.getByRole('checkbox')).toHaveCount(6)
      await expectDialogFits(page, formulario, `formulario a ${width} px`)
      await expectTargets(formulario, `formulario a ${width} px`)
      for (const nombre of ['Agregar alternativa', 'Agregar otro período', 'Guardar cambios']) {
        await expectReachable(
          page,
          formulario.getByRole('button', { name: nombre }),
          `formulario a ${width} px`,
        )
      }
      await formulario.getByRole('button', { name: 'Cancelar' }).click()
      await expect(formulario).toBeHidden()

      // ---- El historial -----------------------------------------------------
      await diario.getByRole('button', { name: 'Historial' }).click()
      const historial = await openedDialog(page.getByRole('dialog'))
      await expect(historial.getByText('Versión 2')).toBeVisible()
      await expect(historial.getByText('Versión 1')).toBeVisible()
      await expectDialogFits(page, historial, `historial a ${width} px`)
      await expectTargets(historial, `historial a ${width} px`)
      await historial.getByRole('button', { name: 'Cerrar' }).click()
      await expect(historial).toBeHidden()

      // ---- Confirmación: archivar ------------------------------------------
      await diario.getByRole('button', { name: 'Archivar' }).click()
      const archivar = await openedDialog(page.getByRole('alertdialog'))
      await expectDialogFits(page, archivar, `archivar a ${width} px`)
      await expectTargets(archivar, `archivar a ${width} px`)
      await expectReachable(
        page,
        archivar.getByRole('button', { name: 'Archivar premio' }),
        `archivar a ${width} px`,
      )
      await archivar.getByRole('button', { name: 'Cancelar' }).click()
      await expect(archivar).toBeHidden()

      // ---- La revisión ------------------------------------------------------
      await page.goto(`/owner/raffles/${raffleId}/review`)
      const activar = page.getByRole('button', { name: 'Activar rifa' })
      await expect(activar).toBeEnabled()
      expect(await desbordamiento(page), `revisión a ${width} px`).toBeLessThanOrEqual(0)
      for (const accion of [
        activar,
        page.getByRole('link', { name: 'Volver a los premios' }),
        page.getByRole('link', { name: 'Guardar y terminar después' }),
      ]) {
        await expectReachable(page, accion, `revisión a ${width} px`)
        await expectTargets(accion, `revisión a ${width} px`)
      }

      // ---- Confirmación: activar (se cancela: la rifa sirve a los cuatro) ---
      await activar.click()
      const confirmar = await openedDialog(page.getByRole('alertdialog'))
      await expectDialogFits(page, confirmar, `activar a ${width} px`)
      await expectTargets(confirmar, `activar a ${width} px`)
      await expectReachable(
        page,
        confirmar.getByRole('button', { name: 'Activar rifa' }),
        `activar a ${width} px`,
      )
      await confirmar.getByRole('button', { name: 'Cancelar' }).click()
      await expect(confirmar).toBeHidden()
    })
  }
})

/** Un período del calendario, con las claves que lee la RPC. */
function rule(start: string, end: string, weekdays: number[]) {
  return {
    start_date: start,
    end_date: end,
    weekdays,
    lottery_mode: 'corresponding' as const,
    lottery_code: null,
  }
}

/**
 * Espera a que el diálogo termine de ENTRAR. Mientras dura `zoom-in-95` su caja
 * está escalada y cualquier medida de posición miente (D-178). Solo se esperan
 * las animaciones del propio diálogo: las del esqueleto de carga no terminan.
 */
async function openedDialog(dialog: Locator): Promise<Locator> {
  await expect(dialog).toBeVisible()
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  )
  return dialog
}

/** El documento no se desborda, el diálogo tampoco y ningún control se sale de él. */
async function expectDialogFits(page: Page, dialog: Locator, where: string) {
  expect(await desbordamiento(page), `${where}: el documento se desborda`).toBeLessThanOrEqual(0)

  const { overflow, outside } = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const controls = element.querySelectorAll(
      'button, input:not([aria-hidden="true"]), textarea, [role="combobox"], label',
    )
    return {
      overflow: element.scrollWidth - element.clientWidth,
      outside: [...controls]
        .filter((control) => {
          const rect = control.getBoundingClientRect()
          return rect.width > 0 && (rect.left < box.left - 0.5 || rect.right > box.right + 0.5)
        })
        .map((control) =>
          (control.getAttribute('aria-label') ?? control.textContent ?? control.tagName)
            .trim()
            .replace(/\s+/g, ' '),
        ),
    }
  })

  expect(overflow, `${where}: el diálogo se desplaza a lo ancho`).toBeLessThanOrEqual(0)
  expect(outside, `${where}: controles que se salen del diálogo`).toEqual([])
}

/**
 * Toda diana visible mide al menos 44 × 44: botones, enlaces con forma de botón,
 * desplegables, campos de una línea y las etiquetas de las casillas de los días
 * —la casilla de Radix mide 16 px; lo que se toca es su etiqueta—. Se mide con
 * la hoja de estilos (D-178).
 */
async function expectTargets(scope: Locator, where: string) {
  const selector = [
    'button:not([role="checkbox"])',
    'a[href]',
    '[role="combobox"]',
    'input:not([type="checkbox"]):not([type="hidden"]):not([aria-hidden="true"])',
    'label:has(> [role="checkbox"])',
  ].join(', ')

  const measures = await scope.evaluate((element, css) => {
    const targets = element.matches(css) ? [element] : [...element.querySelectorAll(css)]
    return targets
      .filter((target) => target.getClientRects().length > 0)
      .map((target) => {
        const style = getComputedStyle(target)
        return {
          name: (target.getAttribute('aria-label') ?? target.textContent ?? target.tagName)
            .trim()
            .replace(/\s+/g, ' '),
          height: Number.parseFloat(style.height),
          width: Number.parseFloat(style.width),
        }
      })
  }, selector)

  expect(measures.length, `${where}: no hay dianas que medir`).toBeGreaterThan(0)
  for (const measure of measures) {
    expect(
      measure.height,
      `${where}: «${measure.name}» mide ${measure.height} px de alto`,
    ).toBeGreaterThanOrEqual(DIANA)
    expect(
      measure.width,
      `${where}: «${measure.name}» mide ${measure.width} px de ancho`,
    ).toBeGreaterThanOrEqual(DIANA)
  }
}

/** Una acción principal se alcanza: desplazando si hace falta, cabe entera en la ventana. */
async function expectReachable(page: Page, action: Locator, where: string) {
  await action.scrollIntoViewIfNeeded()
  await expect(
    action,
    `${where}: «${await action.textContent()}» fuera de la vista`,
  ).toBeInViewport({
    ratio: 1,
  })
  const box = await action.boundingBox()
  const width = page.viewportSize()!.width
  expect(box, `${where}: sin caja`).not.toBeNull()
  expect(box!.x, `${where}: se sale por la izquierda`).toBeGreaterThanOrEqual(-0.5)
  expect(box!.x + box!.width, `${where}: se sale por la derecha`).toBeLessThanOrEqual(width + 0.5)
}
