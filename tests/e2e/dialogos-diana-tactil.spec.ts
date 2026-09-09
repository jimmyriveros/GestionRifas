import { expect, test, type Locator, type Page } from '@playwright/test'

import { createClientFor, createTicket, loadSeedRefs, type SeedRefs } from './db-setup'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Las acciones de un diálogo se pueden pulsar con el pulgar (I-102, D-177).
 *
 * Esta suite existe por un defecto real y **medido, no visto**: los botones de
 * `ConfirmDialog` medían **36 px** de alto en el teléfono —el `size` por defecto
 * de `Button`— cuando `CLAUDE.md` §27 y el resto del portal usan **44**. Afectaba
 * a TODAS las confirmaciones sensibles: anular una boleta, anular un pago,
 * desactivar a alguien, archivar un cliente, liberar una boleta, aprobar. Un
 * toque fallido ahí es peor que en cualquier otra pantalla, porque quien falla
 * vuelve a intentarlo con más fuerza y menos atención.
 *
 * NO ES LO MISMO QUE `dialogos-alcanzables.spec.ts`, y por eso son dos archivos.
 * Aquella comprueba que la acción final **se pueda alcanzar** —geometría de alto
 * y desplazamiento—; esta, que **se pueda acertar** —geometría de diana—. Un
 * diálogo puede tener su botón perfectamente visible y aun así ser un objetivo
 * de 36 px.
 *
 * SE FIJA EL VIEWPORT EN VEZ DE USAR EL PROYECTO `movil`, por lo mismo que
 * explica la otra suite: lo que se mide es geometría, no emulación táctil, y el
 * proyecto `movil` solo recoge los archivos `*-movil` y `*responsive`.
 *
 * EL SUELO SE COMPRUEBA DONDE EXISTE. Desde `sm` (640 px) el sistema de diseño
 * libera el suelo a propósito —`touch` es `h-11 sm:h-9`— porque un ratón no
 * necesita 44 px. Así que la aserción de 44 va en la ventana estrecha y en la
 * ancha se comprueba lo contrario: que la densidad de escritorio NO cambió.
 */

/** El suelo de la diana táctil, en px (CLAUDE.md §27). */
const DIANA = 44

/**
 * Alto mínimo razonable de un botón compacto de escritorio.
 *
 * Medido, el escritorio da **36 px** exactos —el `h-9` del sistema de diseño—,
 * pero no se afirma esa cifra: lo que esta prueba defiende es la **intención**,
 * que por encima de `sm` el suelo táctil esté liberado y el botón siga siendo un
 * botón. Clavar el 36 acoplaría la prueba al token y la rompería el día que
 * alguien decida, legítimamente, que la densidad de escritorio es otra.
 */
const ESCRITORIO_MIN = 32

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/**
 * Mide TODOS los botones de un diálogo y devuelve sus altos con su nombre.
 *
 * Se miden todos y no solo el de confirmar: «Cancelar» es el que pulsa quien se
 * arrepiente, y fallar ese toque en un diálogo destructivo es exactamente el
 * escenario que hay que evitar.
 */
async function altosDeLosBotones(dialog: Locator): Promise<{ nombre: string; alto: number }[]> {
  const botones = await dialog.getByRole('button').all()
  const medidas: { nombre: string; alto: number }[] = []
  for (const b of botones) {
    // `getComputedStyle`, NO `boundingBox()`, y esto costó una vuelta entera.
    // La caja del navegador devolvía **43,07 px** sobre un botón que la hoja de
    // estilos dejaba en 44: `AlertDialogContent` entra con `zoom-in-95`, así que
    // durante la animación el contenido sigue escalado y la caja mide el
    // fotograma en vez del contrato. La altura calculada es exacta y estable, y
    // es la que de verdad expresa la regla.
    const alto = await b.evaluate((el) => parseFloat(getComputedStyle(el).height))
    const nombre = (await b.textContent())?.trim() ?? '(sin texto)'
    medidas.push({ nombre, alto })
  }
  return medidas
}

async function esperarDiana(dialog: Locator, minimo: number) {
  await expect(dialog).toBeVisible()
  const medidas = await altosDeLosBotones(dialog)
  expect(medidas.length, 'el diálogo debe tener botones que medir').toBeGreaterThan(0)
  for (const m of medidas) {
    expect(m.alto, `«${m.nombre}» mide ${m.alto} px de alto`).toBeGreaterThanOrEqual(minimo)
  }
}

/** Abre «Archivar cliente»: un `ConfirmDialog` del portal del vendedor. */
async function abrirArchivarCliente(page: Page): Promise<Locator> {
  const client = await createClientFor(refs, unique('Cliente diana'))
  await loginAs(page, ACCOUNTS.seller)
  await page.goto(`/seller/clients/${client.id}`)
  await page.getByRole('button', { name: /Archivar/ }).click()
  return page.getByRole('alertdialog')
}

/** Abre «Anular boleta»: un `ConfirmDialog` DESTRUCTIVO del portal administrativo. */
async function abrirAnularBoleta(page: Page): Promise<Locator> {
  const numbers = randomTicketNumbers()
  const ticket = await createTicket(refs, {
    dailyNumber: numbers.daily,
    weeklyNumber: numbers.weekly,
    inventoryStatus: 'available',
  })
  await loginAs(page, ACCOUNTS.owner)
  await page.goto(`/owner/tickets/${ticket.id}`)
  await page.getByRole('button', { name: 'Anular boleta' }).click()
  return page.getByRole('alertdialog')
}

test.describe('En el teléfono, las acciones de un diálogo miden 44 px', () => {
  test.use({ viewport: { width: 320, height: 720 } })

  test('«Archivar cliente» — el ConfirmDialog compartido (I-102)', async ({ page }) => {
    await esperarDiana(await abrirArchivarCliente(page), DIANA)
  })

  test('«Anular boleta» — el mismo diálogo, en su variante destructiva', async ({ page }) => {
    await esperarDiana(await abrirAnularBoleta(page), DIANA)
  })
})

test.describe('En escritorio la densidad no cambia', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  /**
   * La otra mitad del arreglo, y la que impide que «subir la diana» se convierta
   * en «engordar la aplicación». `touch` es `h-11 sm:h-9`: por encima de 640 px
   * tiene que volver a los 36 px de siempre, exactamente los mismos que antes.
   */
  test('los botones del diálogo NO crecen por encima de `sm`', async ({ page }) => {
    const dialog = await abrirArchivarCliente(page)
    await expect(dialog).toBeVisible()
    for (const m of await altosDeLosBotones(dialog)) {
      expect(m.alto, `«${m.nombre}» creció a ${m.alto} px en escritorio`).toBeLessThan(DIANA)
      expect(m.alto, `«${m.nombre}» mide ${m.alto} px, no parece un botón`).toBeGreaterThanOrEqual(
        ESCRITORIO_MIN,
      )
    }
  })
})
