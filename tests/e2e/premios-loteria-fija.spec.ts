import { expect, test, type Locator } from '@playwright/test'

import { loadSeedRefs, signedInClient } from './db-setup'
import { ACCOUNTS, loginAs, unique } from './fixtures'

/**
 * El desplegable de una lotería fija SIN ELEGIR se lee entero (I-123, D-202).
 *
 * Con «Una lotería fija» elegida como modo y ninguna lotería todavía, el control
 * enseña la instrucción completa: «Elige la lotería con la que juega el premio.».
 * Hasta el 2026-09-16, desde `sm` se cortaba sin puntos suspensivos —258 px de
 * texto en una caja de 225, medido a 768 y a 1280 px—. Aquí se mide en SEIS
 * anchos, del teléfono más estrecho al escritorio:
 *
 *   1. EL TEXTO SE VE ENTERO: la caja del texto cabe dentro de la del control, a
 *      lo ancho y a lo alto; nada queda escondido por `overflow`, no hay puntos
 *      suspensivos y la letra no se encoge para caber.
 *   2. SIN DESPLAZAMIENTO LATERAL, ni del documento ni del diálogo, y el control
 *      no se sale de la caja del diálogo.
 *   3. LA DIANA: en el teléfono no baja de 44 × 44; desde `sm` la instrucción cabe
 *      en UNA línea y el control mide lo mismo que su vecino, el desplegable del
 *      modo, para que no haya un salto visual sin motivo.
 *
 * SE FIJA EL VIEWPORT en el proyecto de escritorio: lo que se mide es geometría,
 * no emulación táctil (el mismo criterio que `dialogos-diana-tactil.spec.ts`), y
 * así los seis anchos corren en el mismo proyecto.
 *
 * La rifa y su premio se preparan UNA vez por las RPC de verdad, con la sesión
 * del Dueño: el período va de lunes a viernes, de modo que al pasar a lotería
 * fija no hay un único día del que deducirla y el desplegable queda sin elegir.
 * Cada ancho abre el formulario, cambia el modo, mide y cancela sin guardar.
 */

const INSTRUCCION = 'Elige la lotería con la que juega el premio.'
const ANCHOS = [320, 375, 390, 430, 768, 1280] as const

/** El punto de corte `sm` del sistema de diseño (40rem). */
const SM = 640
/** El suelo de la diana táctil en el teléfono (CLAUDE.md §27). */
const DIANA = 44

let raffleId = ''

test.beforeAll(async () => {
  const refs = await loadSeedRefs()
  const owner = await signedInClient(ACCOUNTS.owner)

  const { data: raffle, error } = await owner
    .from('raffles')
    .insert({
      organization_id: refs.organizationId,
      name: unique('Rifa loteria fija'),
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

  const prize = await owner.rpc('create_raffle_prize', {
    p_raffle_id: raffleId,
    p_title: 'Premio de la semana',
    p_category: 'weekly',
    p_reward_mode: 'fixed',
    p_reward_options: [{ description: null, amount: 500_000 }],
    p_number_field: 'weekly_number',
    p_digits: 'four',
    p_rules: [
      {
        start_date: '2026-11-02',
        end_date: '2026-11-06',
        weekdays: [1, 2, 3, 4, 5],
        lottery_mode: 'corresponding',
        lottery_code: null,
      },
    ],
  })
  if (prize.error) throw prize.error
})

for (const width of ANCHOS) {
  test(`a ${width} px la instrucción de la lotería fija se lee entera`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await loginAs(page, ACCOUNTS.owner)
    await page.goto(`/owner/raffles/${raffleId}/prizes`)

    // El listado tiene dos caras —tarjeta y tabla— y las dos están en el DOM: se
    // pulsa la que se ve. Reintento deliberado por el hueco de la hidratación
    // tras la carga (TESTING §5.3): abrir el formulario es inocuo.
    const dialog = page.getByRole('dialog')
    await expect(async () => {
      await page.getByRole('button', { name: 'Editar' }).filter({ visible: true }).click()
      await expect(dialog).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 20_000 })
    await finishedOpening(dialog)

    // El modo pasa a «Una lotería fija»; la lotería queda sin elegir.
    await triggerWithText(dialog, 'La que corresponde a cada día').click()
    await page.getByRole('option', { name: 'Una lotería fija' }).click()

    const control = triggerWithText(dialog, INSTRUCCION)
    const mode = triggerWithText(dialog, 'Una lotería fija')
    await expect(control).toBeVisible()
    await control.scrollIntoViewIfNeeded()
    await expect(control).toHaveText(INSTRUCCION)

    const where = `lotería fija sin elegir a ${width} px`
    const m = await measure(control)

    // 1. El texto se ve entero. Se compara con SU zona —la del valor—, no con el
    // botón entero: antes de I-123 el texto cortado seguía dentro del botón,
    // metido bajo la flecha, y solo lo delataba lo escondido por `overflow`.
    expect(m.text.left, `${where}: el texto empieza fuera de su zona`).toBeGreaterThanOrEqual(
      m.value.left - 0.5,
    )
    expect(m.text.right, `${where}: el texto se corta por la derecha`).toBeLessThanOrEqual(
      m.value.right + 0.5,
    )
    expect(m.text.top, `${where}: el texto se sale por arriba`).toBeGreaterThanOrEqual(
      m.box.top - 0.5,
    )
    expect(m.text.bottom, `${where}: el texto se corta por abajo`).toBeLessThanOrEqual(
      m.box.bottom + 0.5,
    )
    expect(m.hiddenX, `${where}: queda texto escondido a lo ancho`).toBeLessThanOrEqual(0)
    expect(m.hiddenY, `${where}: queda texto escondido a lo alto`).toBeLessThanOrEqual(0)
    expect(m.textOverflow, `${where}: puntos suspensivos`).not.toBe('ellipsis')
    expect(m.fontSize, `${where}: la letra se encogió`).toBeGreaterThanOrEqual(14)

    // 2. Sin desplazamiento lateral, y dentro del diálogo.
    expect(m.documentOverflow, `${where}: el documento se desplaza de lado`).toBeLessThanOrEqual(0)
    expect(m.dialogOverflow, `${where}: el diálogo se desplaza de lado`).toBeLessThanOrEqual(0)
    expect(m.box.left, `${where}: se sale del diálogo`).toBeGreaterThanOrEqual(m.dialog.left - 0.5)
    expect(m.box.right, `${where}: se sale del diálogo`).toBeLessThanOrEqual(m.dialog.right + 0.5)

    // 3. La diana, y el vecino.
    if (width < SM) {
      expect(m.height, `${where}: alto de la diana`).toBeGreaterThanOrEqual(DIANA)
      expect(m.width, `${where}: ancho de la diana`).toBeGreaterThanOrEqual(DIANA)
    } else {
      const neighbour = await measure(mode)
      expect(m.lines, `${where}: la instrucción debería caber en una línea`).toBe(1)
      expect(
        Math.abs(m.height - neighbour.height),
        `${where}: mide ${m.height} px y su vecino ${neighbour.height}`,
      ).toBeLessThanOrEqual(0.5)
    }

    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog).toBeHidden()
  })
}

/** Un desplegable por lo que enseña, no por su etiqueta: los dos se llaman «Lotería». */
function triggerWithText(dialog: Locator, text: string): Locator {
  return dialog.locator('[data-slot="select-trigger"]').filter({ hasText: text })
}

/**
 * Espera a que el diálogo termine de ENTRAR: mientras dura `zoom-in-95` las cajas
 * están escaladas y cualquier posición miente (D-178). Solo las animaciones del
 * propio diálogo; las del contenido pueden no terminar nunca.
 */
async function finishedOpening(dialog: Locator) {
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  )
}

/**
 * Mide un desplegable con la hoja de estilos (D-178) y la caja real de su texto:
 * un `Range` sobre el valor devuelve dónde está TODO el texto, también la parte
 * que un `overflow: hidden` escondería.
 */
async function measure(trigger: Locator) {
  return trigger.evaluate((element) => {
    const value = element.querySelector<HTMLElement>('[data-slot="select-value"]')!
    const range = document.createRange()
    range.selectNodeContents(value)
    const text = range.getBoundingClientRect()
    const lineHeight = Number.parseFloat(getComputedStyle(value).lineHeight)
    const box = element.getBoundingClientRect()
    const dialog = element.closest<HTMLElement>('[role="dialog"]')!
    const dialogBox = dialog.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      height: Number.parseFloat(style.height),
      width: Number.parseFloat(style.width),
      fontSize: Number.parseFloat(getComputedStyle(value).fontSize),
      textOverflow: getComputedStyle(value).textOverflow,
      hiddenX: value.scrollWidth - value.clientWidth,
      hiddenY: value.scrollHeight - value.clientHeight,
      lines: Math.round(text.height / lineHeight),
      text: { left: text.left, right: text.right, top: text.top, bottom: text.bottom },
      box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
      value: {
        left: value.getBoundingClientRect().left,
        right: value.getBoundingClientRect().right,
      },
      dialog: { left: dialogBox.left, right: dialogBox.right },
      dialogOverflow: dialog.scrollWidth - dialog.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
}
