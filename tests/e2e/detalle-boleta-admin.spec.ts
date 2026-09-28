import { expect, test, type Locator, type Page } from '@playwright/test'

import { textContrast } from './contrast'
import {
  createClientFor,
  createPaymentWithAllocation,
  loadSeedRefs,
  purgeSellers,
  purgeTestData,
  purgeTestRaffles,
  raffleTicketPrice,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import {
  cerca,
  coloresDe,
  encenderOscuro,
  horasYSusLineas,
  problemasDeMaquetacion,
  TONOS,
} from './detalle-boleta'
import { ACCOUNTS, loginAs, randomTicketNumbers, SEED_PASSWORD } from './fixtures'
import { CLEARANCE_COPY } from '../../src/features/tickets/clearance-receipt'
import { formatDateEs } from '../../src/lib/dates'

/**
 * El detalle de una boleta en el portal ADMINISTRATIVO, recompuesto (D-234).
 *
 * Lo que se mide aquí es lo que una revisión de código no puede ver: dónde cae
 * cada tarjeta en cada ancho, que nada se salga de su tarjeta ni de la página,
 * que las acciones del encabezado quepan sin partir el título y midan 44 px en
 * el teléfono, que cada estado enseñe lo suyo y ofrezca solo sus acciones, que
 * los textos largos se lean enteros, y que el foco recorra la pantalla en el
 * orden en que se lee. Con las cajas y los estilos que calcula el navegador.
 *
 * Y lo que NO debe estar: la cartera del vendedor (D-198). La prueba que mira
 * lo que el navegador RECIBE —HTML, RSC y red— es `privacidad-admin.spec.ts`;
 * aquí se comprueba lo que se pinta.
 *
 * Fija sus propios anchos, así que corre en el proyecto de escritorio.
 */

const SECCIONES = [
  'Números de la boleta',
  'Vendedor y rifa',
  'Estado y venta',
  'Detalles de la boleta',
] as const

type Seccion = (typeof SECCIONES)[number]

const PERSONAL = [
  { rol: 'Dueño', email: ACCOUNTS.owner },
  { rol: 'Administrador', email: ACCOUNTS.admin },
] as const

const NOMBRE_LARGO = 'María Fernanda de los Ángeles Castañeda Villamizar de la Torre'
const RIFA_LARGA =
  'Gran Rifa Navideña de la Camioneta KIA Sportage 2027 con premios diarios y semanales'
const MOTIVO_LARGO =
  'Los números se imprimieron dos veces en la papeleta del talonario 14 y el vendedor devolvió la hoja completa; se anula esta combinación para que no circule repetida entre los clientes del barrio y se reemplaza por otra boleta del mismo talonario.'

type Boleta = { id: string; daily: string | null; weekly: string | null }

let refs: SeedRefs
let vendedorSeed: string
let hoy: string
const boletas = {} as Record<
  'borrador' | 'pendiente' | 'disponible' | 'sinPagar' | 'parcial' | 'pagada' | 'anulada' | 'larga',
  Boleta
>
let rifaLarga: { id: string; shortCode: string }
let ajenaId: string

/**
 * Lo que crea la suite, apuntado EN CUANTO EXISTE y no al final: si `beforeAll`
 * falla a medias, `afterAll` borra lo que alcanzó a crear. Y si una prueba
 * falla, Playwright cambia de proceso y vuelve a ejecutar `beforeAll`; cada
 * proceso borra lo suyo. Los abonos no se apuntan: cuelgan de sus clientes y
 * `purgeTestData` los borra con ellos (I-035).
 */
const clientesCreados: string[] = []
const boletasCreadas: string[] = []
const rifasCreadas: string[] = []
const vendedoresCreados: string[] = []

test.beforeAll(async () => {
  refs = await loadSeedRefs()
  const svc = serviceClient()
  const precio = await raffleTicketPrice(refs)
  hoy = new Date().toISOString().slice(0, 10)

  const { data: perfil } = await svc
    .from('profiles')
    .select('full_name')
    .eq('id', refs.sellerId)
    .single()
  vendedorSeed = perfil!.full_name

  /** Una boleta con los campos que pida la prueba, en la organización del seed. */
  async function boleta(
    clave: keyof typeof boletas,
    fila: {
      daily: string | null
      weekly: string | null
      status: 'draft' | 'pending_approval' | 'available' | 'assigned' | 'cancelled'
      clientId?: string
      raffleId?: string
      sellerId?: string
      cancelReason?: string
      approved?: boolean
    },
  ): Promise<string> {
    const ahora = new Date().toISOString()
    const { data, error } = await svc
      .from('tickets')
      .insert({
        organization_id: refs.organizationId,
        raffle_id: fila.raffleId ?? refs.raffleId,
        seller_id: fila.sellerId ?? refs.sellerId,
        daily_number: fila.daily,
        weekly_number: fila.weekly,
        inventory_status: fila.status,
        created_by: refs.ownerId,
        ...(fila.approved ? { approved_by: refs.ownerId, approved_at: ahora } : {}),
        ...(fila.status === 'assigned'
          ? {
              client_id: fila.clientId,
              sale_price: precio,
              base_price: precio,
              sale_date: hoy,
              assigned_at: ahora,
            }
          : {}),
        ...(fila.status === 'cancelled'
          ? { cancelled_at: ahora, cancel_reason: fila.cancelReason ?? null }
          : {}),
      })
      .select('id')
      .single()
    if (error) throw error
    boletasCreadas.push(data.id)
    boletas[clave] = { id: data.id, daily: fila.daily, weekly: fila.weekly }
    return data.id
  }

  async function cliente(nombre: string, sellerId = refs.sellerId): Promise<string> {
    const creado = await createClientFor(refs, nombre, sellerId)
    clientesCreados.push(creado.id)
    return creado.id
  }

  const n = () => randomTicketNumbers()

  // Un vendedor propio de la suite, con el nombre largo, para no renombrar a
  // nadie del seed. Va PRIMERO: la boleta pagada es suya (ver abajo).
  const correo = `detalle-admin-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}@demo.test`
  const { data: cuenta, error: cuentaError } = await svc.auth.admin.createUser({
    email: correo,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: NOMBRE_LARGO, phone: '3002223344' },
  })
  if (cuentaError || !cuenta.user) throw cuentaError ?? new Error('No se pudo crear la cuenta')
  const vendedorPropio = cuenta.user.id
  vendedoresCreados.push(vendedorPropio)
  const { error: membresiaError } = await svc.from('memberships').insert({
    organization_id: refs.organizationId,
    profile_id: vendedorPropio,
    role: 'seller',
  })
  if (membresiaError) throw membresiaError

  // Un borrador con un solo número: «números incompletos».
  await boleta('borrador', { daily: n().daily, weekly: null, status: 'draft' })
  const pendiente = n()
  await boleta('pendiente', { ...pendiente, status: 'pending_approval' })
  // Ceros iniciales: se enseñan tal cual (BR-N03).
  await boleta('disponible', {
    daily: `00${n().daily.slice(2)}`,
    weekly: `0${n().weekly.slice(1)}`,
    status: 'available',
  })
  await boleta('sinPagar', {
    ...n(),
    status: 'assigned',
    clientId: await cliente('Detalle admin sin pagar'),
  })

  // Un abono parcial: para el personal es «Sin pagar», nunca «Abonada» (BR-Q04).
  const clienteParcial = await cliente('Detalle admin parcial')
  const parcial = await boleta('parcial', {
    ...n(),
    status: 'assigned',
    clientId: clienteParcial,
    approved: true,
  })
  await createPaymentWithAllocation(refs, {
    clientId: clienteParcial,
    ticketId: parcial,
    amount: 20_000,
    method: 'cash',
    paymentDate: hoy,
  })
  // Paz y salvo entregado a mano: con su fecha.
  await svc
    .from('tickets')
    .update({ clearance_receipt_delivered_at: new Date().toISOString() })
    .eq('id', parcial)

  // Pagada entera, con el paz y salvo de la carga inicial: sin fecha (D-170).
  // Es del vendedor PROPIO: una boleta que queda pagada le apunta la ganancia a
  // su vendedor, y en el vendedor 1 dejaba dos filas en `commission_ledger` por
  // pasada; en este las borra `purgeSellers` con todo lo suyo.
  const clientePagada = await cliente('Detalle admin pagada', vendedorPropio)
  const pagada = await boleta('pagada', {
    ...n(),
    status: 'assigned',
    sellerId: vendedorPropio,
    clientId: clientePagada,
    approved: true,
  })
  await createPaymentWithAllocation(refs, {
    clientId: clientePagada,
    ticketId: pagada,
    amount: precio,
    method: 'cash',
    paymentDate: hoy,
    sellerId: vendedorPropio,
  })
  await svc
    .from('tickets')
    .update({
      clearance_receipt_delivered_at: new Date().toISOString(),
      clearance_receipt_assumed_delivered: true,
    })
    .eq('id', pagada)

  await boleta('anulada', {
    ...n(),
    status: 'cancelled',
    approved: true,
    cancelReason: MOTIVO_LARGO,
  })

  // Nombres largos: el vendedor propio y una rifa propia, también de la suite.
  const { data: rifa, error: rifaError } = await svc
    .from('raffles')
    .insert({
      organization_id: refs.organizationId,
      name: `${RIFA_LARGA} ${Date.now().toString(36)}`,
      ticket_price: precio,
      start_date: hoy,
      end_date: '2099-12-31',
      status: 'active',
      created_by: refs.ownerId,
    })
    .select('id, short_code, name')
    .single()
  if (rifaError) throw rifaError
  rifasCreadas.push(rifa.id)
  rifaLarga = { id: rifa.id, shortCode: `${rifa.short_code} — ${rifa.name}` }

  await boleta('larga', {
    ...n(),
    status: 'assigned',
    raffleId: rifa.id,
    sellerId: vendedorPropio,
    clientId: await cliente('Detalle admin nombres largos', vendedorPropio),
  })

  // Una boleta de OTRA organización, del seed: no se crea ni se borra.
  const { data: ajena } = await svc
    .from('tickets')
    .select('id')
    .neq('organization_id', refs.organizationId)
    .limit(1)
    .single()
  ajenaId = ajena!.id
})

test.afterAll(async () => {
  await purgeTestData({ clientIds: clientesCreados, ticketIds: boletasCreadas })
  await purgeTestRaffles({ raffleIds: rifasCreadas })
  if (vendedoresCreados.length > 0) {
    await purgeSellers(vendedoresCreados)
    const svc = serviceClient()
    for (const id of vendedoresCreados) {
      const { error } = await svc.auth.admin.deleteUser(id)
      if (error) throw new Error(`No se pudo borrar la cuenta ${id}: ${error.message}`)
    }
  }
})

/** La tarjeta de una sección: el `Card` que contiene su `h2`. */
function tarjeta(page: Page, titulo: Seccion): Locator {
  return page
    .locator('main [data-slot="card"]')
    .filter({ has: page.getByRole('heading', { level: 2, name: titulo, exact: true }) })
}

/** Las acciones del encabezado de la pantalla. */
function acciones(page: Page): Locator {
  return page.locator('main [data-tour="page-actions"]')
}

async function abrir(page: Page, ticketId: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`/owner/tickets/${ticketId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Detalle boleta' })).toBeVisible()
}

async function cajas(
  page: Page,
): Promise<Record<Seccion, { x: number; y: number; width: number; height: number }>> {
  const out = {} as Record<Seccion, { x: number; y: number; width: number; height: number }>
  for (const titulo of SECCIONES) {
    const caja = await tarjeta(page, titulo).boundingBox()
    expect(caja, `la tarjeta «${titulo}» existe`).not.toBeNull()
    out[titulo] = caja!
  }
  return out
}

/** El valor de un dato de «Estado y venta» o de «Detalles», por su rótulo. */
function dato(page: Page, seccion: Seccion, rotulo: string): Locator {
  return tarjeta(page, seccion)
    .locator('dt')
    .filter({ hasText: new RegExp(`^${rotulo}$`, 'i') })
    .locator('xpath=following-sibling::dd[1]')
}

test.describe('Detalle administrativo de una boleta: composición (D-234)', () => {
  for (const { rol, email } of PERSONAL) {
    test(`${rol}: cuatro secciones con su h2, en el orden del teléfono`, async ({ page }) => {
      await loginAs(page, email)
      await abrir(page, boletas.parcial.id, 390)
      expect(await page.locator('main h2').allTextContents()).toEqual([...SECCIONES])
    })
  }

  test('teléfono (390): una sola columna, en ese orden', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await abrir(page, boletas.parcial.id, 390)
    const c = await cajas(page)
    const primera = c[SECCIONES[0]]
    for (let i = 1; i < SECCIONES.length; i++) {
      const anterior = c[SECCIONES[i - 1]!]
      const actual = c[SECCIONES[i]!]
      expect(cerca(actual.x, primera.x), `${SECCIONES[i]} alineada a la izquierda`).toBe(true)
      expect(cerca(actual.width, primera.width), `${SECCIONES[i]} a todo el ancho`).toBe(true)
      expect(actual.y, `${SECCIONES[i]} debajo de ${SECCIONES[i - 1]}`).toBeGreaterThan(
        anterior.y + anterior.height,
      )
    }
  })

  test('tableta (834): una columna a lo ancho, sin tarjetas estiradas, y el vendedor y la rifa lado a lado', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    await abrir(page, boletas.parcial.id, 834)
    const c = await cajas(page)
    const primera = c[SECCIONES[0]]
    for (const titulo of SECCIONES) {
      expect(cerca(c[titulo].x, primera.x), `${titulo} empieza a la izquierda`).toBe(true)
      expect(cerca(c[titulo].width, primera.width), `${titulo} a todo el ancho`).toBe(true)
    }
    // «Números» mide lo suyo: ni un píxel en blanco que no sea su relleno.
    const numeros = tarjeta(page, 'Números de la boleta')
    const diario = await numeros
      .getByText('Número diario', { exact: true })
      .locator('..')
      .boundingBox()
    const bajoLasCajas =
      c['Números de la boleta'].y + c['Números de la boleta'].height - (diario!.y + diario!.height)
    expect(bajoLasCajas, `${bajoLasCajas} px bajo las cajas`).toBeLessThanOrEqual(21)

    const vendedor = await page.getByRole('link', { name: /^Vendedor / }).boundingBox()
    const rifa = await page.getByRole('link', { name: /^Rifa / }).boundingBox()
    expect(cerca(vendedor!.y, rifa!.y), 'vendedor y rifa comparten fila').toBe(true)
    expect(rifa!.x).toBeGreaterThan(vendedor!.x + vendedor!.width)
  })

  for (const width of [1024, 1280, 1440, 1920]) {
    test(`escritorio (${width}): dos columnas que se apilan cada una por su cuenta`, async ({
      page,
    }) => {
      await loginAs(page, ACCOUNTS.owner)
      await abrir(page, boletas.parcial.id, width)
      const c = await cajas(page)
      const izquierda = [c['Números de la boleta'], c['Vendedor y rifa']]
      const derecha = [c['Estado y venta'], c['Detalles de la boleta']]
      for (const columna of [izquierda, derecha]) {
        expect(cerca(columna[1]!.x, columna[0]!.x)).toBe(true)
        const hueco = columna[1]!.y - (columna[0]!.y + columna[0]!.height)
        expect(cerca(hueco, 20), `hueco de ${hueco} px entre tarjetas de una columna`).toBe(true)
      }
      expect(cerca(izquierda[0]!.y, derecha[0]!.y), 'las dos columnas empiezan juntas').toBe(true)
      expect(derecha[0]!.x).toBeGreaterThan(izquierda[0]!.x + izquierda[0]!.width)
      // La columna de la boleta mide lo mismo que la del vendedor: 360 px.
      expect(cerca(izquierda[0]!.width, 360)).toBe(true)
      // Y en ella el vendedor y la rifa van uno debajo del otro.
      const vendedor = await page.getByRole('link', { name: /^Vendedor / }).boundingBox()
      const rifa = await page.getByRole('link', { name: /^Rifa / }).boundingBox()
      expect(rifa!.y).toBeGreaterThan(vendedor!.y + vendedor!.height)
    })
  }

  /**
   * `problemasDeMaquetacion` no mira lo que se pisa DENTRO de una tarjeta. Esto
   * sí: la insignia más larga, «Pendiente de aprobación» (154 px), junto a
   * «Sin venta». En el detalle del vendedor, con dos columnas fijas, se monta
   * sobre ella a 320 y 360 px (I-173).
   */
  test('«Pendiente de aprobación» no se monta sobre su vecina, a 320, 360, 390 y 834', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.owner)
    for (const width of [320, 360, 390, 834]) {
      await abrir(page, boletas.pendiente.id, width)
      const insignia = (await dato(page, 'Estado y venta', 'Estado')
        .getByText('Pendiente de aprobación', { exact: true })
        .boundingBox())!
      const vecina = (await dato(page, 'Estado y venta', 'Estado de pago').boundingBox())!
      const ancho =
        Math.min(insignia.x + insignia.width, vecina.x + vecina.width) -
        Math.max(insignia.x, vecina.x)
      const alto =
        Math.min(insignia.y + insignia.height, vecina.y + vecina.height) -
        Math.max(insignia.y, vecina.y)
      expect(ancho > 0 && alto > 0, `se pisan a ${width} px`).toBe(false)
    }
  })

  for (const width of [320, 390, 834, 1024, 1280, 1440, 1920]) {
    test(`a ${width} px nada desborda, nada se pisa y nada asoma de su tarjeta`, async ({
      page,
    }) => {
      await loginAs(page, ACCOUNTS.owner)
      // Las tres más exigentes: cinco acciones, nombres largos y un motivo largo.
      for (const clave of ['pendiente', 'larga', 'anulada'] as const) {
        await abrir(page, boletas[clave].id, width)
        expect(await problemasDeMaquetacion(page), `${clave} a ${width} px`).toEqual([])
      }
    })
  }
})

test.describe('Detalle administrativo: el encabezado y sus acciones (D-234)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('en el teléfono las acciones miden 44 px y llenan cada fila de lado a lado', async ({
    page,
  }) => {
    for (const width of [320, 390]) {
      await abrir(page, boletas.pendiente.id, width)
      const contenedor = (await acciones(page).boundingBox())!
      const botones = await acciones(page).getByRole('button').all()
      expect(botones.length).toBe(5)
      const filas = new Map<number, { izquierda: number; derecha: number }>()
      for (const boton of botones) {
        const b = (await boton.boundingBox())!
        expect(b.height, `${await boton.innerText()} a ${width} px`).toBeGreaterThanOrEqual(44)
        const fila = Math.round(b.y)
        const actual = filas.get(fila) ?? { izquierda: Infinity, derecha: -Infinity }
        filas.set(fila, {
          izquierda: Math.min(actual.izquierda, b.x),
          derecha: Math.max(actual.derecha, b.x + b.width),
        })
      }
      for (const [y, fila] of filas) {
        expect(cerca(fila.izquierda, contenedor.x), `fila en y=${y} a ${width} px`).toBe(true)
        expect(cerca(fila.derecha, contenedor.x + contenedor.width), `fila en y=${y}`).toBe(true)
      }
    }
  })

  test('hasta lg las acciones van debajo del título y el título no se parte', async ({ page }) => {
    for (const width of [640, 834]) {
      await abrir(page, boletas.pendiente.id, width)
      const titulo = (await page.getByRole('heading', { level: 1 }).boundingBox())!
      const primera = (await acciones(page).getByRole('button').first().boundingBox())!
      // Una sola línea: el rol `Heading/H2` tiene 32 px de línea.
      expect(titulo.height, `alto del título a ${width} px`).toBeLessThan(40)
      expect(primera.y, `las acciones debajo del título a ${width} px`).toBeGreaterThan(
        titulo.y + titulo.height,
      )
    }
  })

  test('desde lg las cinco acciones caben a la derecha del título, en una fila', async ({
    page,
  }) => {
    for (const width of [1024, 1440]) {
      await abrir(page, boletas.pendiente.id, width)
      const titulo = (await page.getByRole('heading', { level: 1 }).boundingBox())!
      const botones = await acciones(page).getByRole('button').all()
      const ys = new Set<number>()
      for (const boton of botones) {
        const b = (await boton.boundingBox())!
        expect(b.x, `${await boton.innerText()} a la derecha del título`).toBeGreaterThan(
          titulo.x + titulo.width,
        )
        ys.add(Math.round(b.y))
      }
      expect(ys.size, `una sola fila a ${width} px`).toBe(1)
    }
  })
})

test.describe('Detalle administrativo: cada estado enseña lo suyo (D-234, D-198)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  /** Los nombres de las acciones del encabezado, en su orden. */
  async function nombresDeAcciones(page: Page): Promise<string[]> {
    const lista = acciones(page)
    if ((await lista.count()) === 0) return []
    return (await lista.getByRole('button').allInnerTexts()).map((t) => t.trim())
  }

  test('borrador con un solo número: la raya se anuncia «Sin número»', async ({ page }) => {
    await abrir(page, boletas.borrador.id, 390)
    const numeros = tarjeta(page, 'Números de la boleta')
    await expect(numeros.getByText(boletas.borrador.daily!, { exact: true })).toBeVisible()
    await expect(numeros.getByText('Sin número', { exact: true })).toHaveCount(1)
    await expect(dato(page, 'Estado y venta', 'Estado')).toHaveText('Borrador')
    await expect(dato(page, 'Estado y venta', 'Estado de pago')).toHaveText('Sin venta')
    await expect(tarjeta(page, 'Estado y venta').getByText('Fecha de venta')).toHaveCount(0)
    expect(await nombresDeAcciones(page)).toEqual([
      'Editar números',
      'Cambiar vendedor',
      'Anular boleta',
      'Eliminar boleta',
    ])
  })

  test('pendiente de aprobación: «Aprobada: Todavía no» y las cinco acciones', async ({ page }) => {
    await abrir(page, boletas.pendiente.id, 1440)
    await expect(dato(page, 'Estado y venta', 'Estado')).toHaveText('Pendiente de aprobación')
    await expect(dato(page, 'Detalles de la boleta', 'Aprobada')).toHaveText('Todavía no')
    expect(await nombresDeAcciones(page)).toEqual([
      'Aprobar boleta',
      'Editar números',
      'Cambiar vendedor',
      'Anular boleta',
      'Eliminar boleta',
    ])
  })

  test('disponible: los ceros iniciales se conservan y no se inventa una aprobación', async ({
    page,
  }) => {
    await abrir(page, boletas.disponible.id, 1440)
    const numeros = tarjeta(page, 'Números de la boleta')
    await expect(numeros.getByText(boletas.disponible.daily!, { exact: true })).toBeVisible()
    await expect(numeros.getByText(boletas.disponible.weekly!, { exact: true })).toBeVisible()
    await expect(dato(page, 'Estado y venta', 'Estado')).toHaveText('Disponible')
    await expect(dato(page, 'Estado y venta', 'Estado de pago')).toHaveText('Sin venta')
    // La creó el personal: nunca necesitó aprobación, y la fila no se escribe.
    await expect(tarjeta(page, 'Detalles de la boleta').getByText('Aprobada')).toHaveCount(0)
    await expect(tarjeta(page, 'Detalles de la boleta').getByText('Anulada')).toHaveCount(0)
  })

  test('vendida sin abonos: «Sin pagar», su fecha de venta, el paz y salvo y solo «Editar números»', async ({
    page,
  }) => {
    await abrir(page, boletas.sinPagar.id, 1440)
    await expect(dato(page, 'Estado y venta', 'Estado')).toHaveText('Asignada')
    await expect(dato(page, 'Estado y venta', 'Estado de pago')).toHaveText('Sin pagar')
    await expect(dato(page, 'Estado y venta', 'Fecha de venta')).toHaveText(formatDateEs(hoy))
    await expect(dato(page, 'Estado y venta', 'Paz y salvo')).toContainText(
      CLEARANCE_COPY.pending.long,
    )
    expect(await nombresDeAcciones(page)).toEqual(['Editar números'])
  })

  test('vendida con un abono parcial: «Sin pagar», nunca «Abonada», y el paz y salvo con su fecha', async ({
    page,
  }) => {
    await abrir(page, boletas.parcial.id, 1440)
    await expect(dato(page, 'Estado y venta', 'Estado de pago')).toHaveText('Sin pagar')
    await expect(page.getByText('Abonada')).toHaveCount(0)
    const pazYSalvo = dato(page, 'Estado y venta', 'Paz y salvo')
    await expect(pazYSalvo).toContainText(CLEARANCE_COPY.delivered.long)
    await expect(pazYSalvo.getByText(/^Entregado el /)).toBeVisible()
    await expect(page.getByRole('switch')).toHaveCount(0)
  })

  test('pagada: «Pagada», y el paz y salvo de la carga inicial sin fecha', async ({ page }) => {
    await abrir(page, boletas.pagada.id, 1440)
    await expect(dato(page, 'Estado y venta', 'Estado de pago')).toHaveText('Pagada')
    const pazYSalvo = dato(page, 'Estado y venta', 'Paz y salvo')
    await expect(pazYSalvo).toContainText(CLEARANCE_COPY.assumedNote)
    await expect(pazYSalvo.getByText(/^Entregado el /)).toHaveCount(0)
  })

  test('anulada: su fecha, el motivo entero y ninguna acción', async ({ page }) => {
    await abrir(page, boletas.anulada.id, 1440)
    await expect(dato(page, 'Estado y venta', 'Estado')).toHaveText('Anulada')
    await expect(dato(page, 'Estado y venta', 'Estado de pago')).toHaveText('Sin venta')
    await expect(dato(page, 'Detalles de la boleta', 'Anulada')).toBeVisible()
    await expect(dato(page, 'Detalles de la boleta', 'Motivo de anulación')).toHaveText(
      MOTIVO_LARGO,
    )
    // El motivo se dice una vez, no en dos tarjetas.
    await expect(page.getByText(MOTIVO_LARGO)).toHaveCount(1)
    expect(await nombresDeAcciones(page)).toEqual([])
  })

  test('el motivo largo ocupa el ancho de la tarjeta en el teléfono, y va junto a su rótulo en escritorio', async ({
    page,
  }) => {
    const medir = async () => {
      const lista = tarjeta(page, 'Detalles de la boleta').locator('dl')
      const rotulo = (await lista.locator('dt', { hasText: 'Motivo de anulación' }).boundingBox())!
      const valor = (await dato(
        page,
        'Detalles de la boleta',
        'Motivo de anulación',
      ).boundingBox())!
      return { lista: (await lista.boundingBox())!, rotulo, valor }
    }

    await abrir(page, boletas.anulada.id, 320)
    const telefono = await medir()
    expect(telefono.valor.y, 'debajo de su rótulo').toBeGreaterThanOrEqual(
      telefono.rotulo.y + telefono.rotulo.height,
    )
    expect(cerca(telefono.valor.width, telefono.lista.width), 'a todo el ancho').toBe(true)

    await abrir(page, boletas.anulada.id, 1440)
    const escritorio = await medir()
    expect(cerca(escritorio.valor.y, escritorio.rotulo.y), 'en la misma línea').toBe(true)
    expect(escritorio.valor.x).toBeGreaterThan(escritorio.rotulo.x + escritorio.rotulo.width)
  })

  test('la hora no se parte entre «a.» y «m.», ni a 320 ni a 390', async ({ page }) => {
    for (const width of [320, 390]) {
      await abrir(page, boletas.anulada.id, width)
      const horas = await horasYSusLineas(tarjeta(page, 'Detalles de la boleta'))
      expect(horas.length, 'creada, aprobada y anulada').toBeGreaterThanOrEqual(3)
      for (const hora of horas) {
        expect(hora.lineas, `«${hora.texto}» a ${width} px`).toBe(1)
      }
    }
  })
})

test.describe('Detalle administrativo: vendedor y rifa (D-234)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('llevan a la ficha del vendedor y a la de la rifa', async ({ page }) => {
    await abrir(page, boletas.parcial.id, 1440)
    const vendedor = page.getByRole('link', { name: `Vendedor ${vendedorSeed}` })
    await expect(vendedor).toHaveAttribute('href', `/owner/sellers/${refs.sellerId}`)
    await expect(
      page.getByRole('link', { name: /^Rifa R\d+ — Rifa Navidad 2026$/ }),
    ).toHaveAttribute('href', `/owner/raffles/${refs.raffleId}`)
    await vendedor.click()
    await page.waitForURL(`**/owner/sellers/${refs.sellerId}`)
  })

  test('los nombres largos se leen enteros, a 320 px y en escritorio', async ({ page }) => {
    for (const width of [320, 1440]) {
      await abrir(page, boletas.larga.id, width)
      for (const [nombre, patron] of [
        ['vendedor', `Vendedor ${NOMBRE_LARGO}`],
        ['rifa', `Rifa ${rifaLarga.shortCode}`],
      ] as const) {
        const enlace = page.getByRole('link', { name: patron, exact: true })
        await expect(enlace, `${nombre} a ${width} px`).toBeVisible()
        // Partido en varias líneas, no recortado: nada queda escondido. El
        // segundo párrafo es el nombre; el primero, su rótulo.
        const recortado = await enlace
          .locator('p')
          .nth(1)
          .evaluate((p) => {
            const s = getComputedStyle(p)
            return s.textOverflow === 'ellipsis' || p.scrollWidth > p.clientWidth
          })
        expect(recortado, `${nombre} a ${width} px`).toBe(false)
      }
    }
  })
})

test.describe('Detalle administrativo: tonos y foco (D-233, D-234)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
  })

  test('el diario y el semanal llevan los dos tonos de índigo del vendedor, en claro y en oscuro', async ({
    page,
  }) => {
    await abrir(page, boletas.parcial.id, 390)
    const numeros = tarjeta(page, 'Números de la boleta')
    const caja = (rotulo: string) => numeros.getByText(rotulo, { exact: true }).locator('..')
    const textos = {
      'rótulo del diario': numeros.getByText('Número diario', { exact: true }),
      'cifra del diario': numeros.getByText(boletas.parcial.daily!, { exact: true }),
      'rótulo del semanal': numeros.getByText('Número semanal', { exact: true }),
      'cifra del semanal': numeros.getByText(boletas.parcial.weekly!, { exact: true }),
    }

    for (const tema of ['claro', 'oscuro'] as const) {
      if (tema === 'oscuro') expect((await encenderOscuro(page)).toLowerCase()).toBe('#0a0a0a')
      for (const width of [320, 1920]) {
        await page.setViewportSize({ width, height: 900 })
        expect(await coloresDe(caja('Número diario')), `${tema} a ${width}`).toEqual(
          TONOS[tema].diario,
        )
        expect(await coloresDe(caja('Número semanal')), `${tema} a ${width}`).toEqual(
          TONOS[tema].semanal,
        )
        for (const [nombre, texto] of Object.entries(textos)) {
          expect(
            await textContrast(texto),
            `${tema} a ${width} px: contraste del ${nombre}`,
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  for (const width of [390, 1440]) {
    test(`a ${width} px el foco recorre el encabezado y después las dos fichas, en el orden en que se leen`, async ({
      page,
    }) => {
      await abrir(page, boletas.pendiente.id, width)
      await page.getByRole('button', { name: 'Volver' }).focus()

      const recorrido: Array<{ nombre: string; y: number; x: number }> = []
      for (let i = 0; i < 7; i++) {
        await page.keyboard.press('Tab')
        const paso = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          if (!el || el === document.body) return null
          const r = el.getBoundingClientRect()
          return { nombre: el.innerText.replace(/\s+/g, ' ').trim(), y: r.top + scrollY, x: r.left }
        })
        if (!paso) break
        recorrido.push(paso)
      }

      // `innerText` devuelve los rótulos en mayúsculas porque así los pinta el CSS.
      expect(recorrido.map((p) => p.nombre.toLowerCase())).toEqual([
        'aprobar boleta',
        'editar números',
        'cambiar vendedor',
        'anular boleta',
        'eliminar boleta',
        `vendedor ${vendedorSeed}`.toLowerCase(),
        expect.stringMatching(/^rifa r\d+ — rifa navidad 2026$/),
      ])
      // Las fichas, después de las acciones y de arriba abajo.
      expect(recorrido[5]!.y).toBeGreaterThan(recorrido[4]!.y)
      expect(recorrido[6]!.y).toBeGreaterThan(recorrido[5]!.y)
    })
  }
})

test.describe('Detalle administrativo: lo que el personal no ve (D-198)', () => {
  for (const { rol, email } of PERSONAL) {
    test(`${rol}: ni cliente, ni precio, ni abonos, ni las tarjetas de la venta del vendedor`, async ({
      page,
    }) => {
      await loginAs(page, email)
      await abrir(page, boletas.parcial.id, 1440)
      const principal = page.locator('main')
      await expect(principal).not.toContainText('Detalle admin parcial')
      await expect(principal).not.toContainText('$')
      await expect(principal).not.toContainText('Abonada')
      for (const titulo of [
        'Cliente',
        'Información de venta',
        'Estado y resumen de pago',
        'Abonos de esta boleta',
      ]) {
        await expect(page.getByRole('heading', { name: titulo, exact: true })).toHaveCount(0)
      }
      await expect(page.locator('a[href*="/clients"], a[href*="/payments"]')).toHaveCount(0)
    })

    test(`${rol}: un id que no existe, uno que no es un id y uno de otra organización responden igual, con un 404`, async ({
      page,
    }) => {
      await loginAs(page, email)
      for (const id of ['00000000-0000-4000-8000-000000000000', 'no-es-un-id', ajenaId]) {
        const respuesta = await page.goto(`/owner/tickets/${id}`)
        expect(respuesta?.status(), id).toBe(404)
        await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
      }
    })
  }
})
