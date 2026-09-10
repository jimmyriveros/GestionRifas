import { expect, test, type Locator, type Page } from '@playwright/test'

import {
  createClientFor,
  loadSeedRefs,
  purgeSellers,
  purgeTestData,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, closeClientCreatedDialog, expectToast, loginAs, unique } from './fixtures'

/**
 * La mascara visual del telefono (D-184).
 *
 * DOS MITADES, y la segunda es la que importa. La primera comprueba lo visible:
 * que «3001234567» se lea «300 123 4567», que pegar con parentesis funcione y
 * que el cursor no salte. La segunda comprueba lo que la mascara NO puede hacer:
 * reescribir un telefono guardado por el simple hecho de abrir su formulario.
 *
 * Ese es el riesgo real de este cambio. La columna `phone` admite `+`, espacios,
 * parentesis y guion desde `0002`, asi que en la base conviven varios formatos;
 * si mostrar uno con separadores acabara guardandolo, una edicion de alias
 * reescribiria en silencio el dato de contacto de un cliente. Por eso las dos
 * pruebas de regresion leen la fila DESPUES de guardar y la comparan caracter
 * por caracter.
 *
 * Los helpers de cursor van con `evaluate`: `selectionStart` no se puede leer
 * con un localizador.
 */

let refs: SeedRefs
const clientesCreados: string[] = []
const vendedoresCreados: string[] = []

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.afterAll(async () => {
  await purgeTestData({ clientIds: clientesCreados })
  await purgeSellers(vendedoresCreados)
})

/** El telefono, como lo ve quien rellena el formulario. */
function campoTelefono(page: Page): Locator {
  return page.getByLabel('Teléfono')
}

async function ponerCursor(campo: Locator, at: number): Promise<void> {
  await campo.focus()
  await campo.evaluate((el, pos) => {
    ;(el as HTMLInputElement).setSelectionRange(pos, pos)
  }, at)
}

async function cursor(campo: Locator): Promise<number> {
  return campo.evaluate((el) => (el as HTMLInputElement).selectionStart ?? -1)
}

test.describe('Lo que se ve al escribir', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients/new')
  })

  test('el campo del cliente muestra «300 123 4567» al escribir «3001234567»', async ({ page }) => {
    const campo = campoTelefono(page)
    await campo.fill('3001234567')
    await expect(campo).toHaveValue('300 123 4567')
  })

  test('conserva los atributos que hacen que el teclado del telefono sea el correcto', async ({
    page,
  }) => {
    const campo = campoTelefono(page)
    await expect(campo).toHaveAttribute('type', 'tel')
    await expect(campo).toHaveAttribute('inputmode', 'tel')
    await expect(campo).toHaveAttribute('autocomplete', 'tel')
    // El ejemplo del campo es la forma nueva, no la de antes.
    await expect(campo).toHaveAttribute('placeholder', '300 123 4567')
  })

  test('los grupos aparecen mientras se escribe, no al salir del campo', async ({ page }) => {
    const campo = campoTelefono(page)
    await campo.click()

    // Hasta el septimo digito el numero todavia puede ser un fijo antiguo
    // completo; desde el octavo solo puede ir camino de uno nacional.
    await campo.pressSequentially('3001234')
    await expect(campo).toHaveValue('3001234')

    await campo.pressSequentially('5')
    await expect(campo).toHaveValue('300 123 45')

    await campo.pressSequentially('67')
    await expect(campo).toHaveValue('300 123 4567')

    // Sin salir del campo: el formato ya esta puesto.
    await expect(campo).toBeFocused()
  })

  test('pegar con indicativo, parentesis y guiones deja «+57 300 123 4567»', async ({ page }) => {
    const campo = campoTelefono(page)

    // `fill` inserta el texto de una vez, que es lo mismo que hace pegar.
    for (const pegado of ['+57 (300) 123-4567', '573001234567', '+57300123456 7']) {
      await campo.fill(pegado)
      await expect(campo, pegado).toHaveValue('+57 300 123 4567')
    }

    for (const pegado of ['300-123-4567', '(300) 123 4567', '300 123 4567']) {
      await campo.fill(pegado)
      await expect(campo, pegado).toHaveValue('300 123 4567')
    }
  })

  test('no deforma un numero internacional que no sea colombiano', async ({ page }) => {
    const campo = campoTelefono(page)
    for (const pegado of ['+1 (212) 555-1234', '+44 20 7123 4567']) {
      await campo.fill(pegado)
      await expect(campo, pegado).toHaveValue(pegado)
    }
  })

  test('borrar junto a un espacio quita un digito, no deja atrapado en el separador', async ({
    page,
  }) => {
    const campo = campoTelefono(page)
    await campo.fill('3001234567')
    await expect(campo).toHaveValue('300 123 4567')

    // Cursor justo detras del primer espacio: una sola pulsacion tiene que
    // quitar el «0» que hay antes, no el espacio que la mascara repondria.
    await ponerCursor(campo, 4)
    await page.keyboard.press('Backspace')
    await expect(campo).toHaveValue('301 234 567')
    expect(await cursor(campo)).toBe(2)
  })

  test('«Suprimir» sobre un espacio se lleva el digito siguiente', async ({ page }) => {
    const campo = campoTelefono(page)
    await campo.fill('3001234567')

    await ponerCursor(campo, 3)
    await page.keyboard.press('Delete')
    await expect(campo).toHaveValue('300 234 567')
    expect(await cursor(campo)).toBe(3)
  })

  test('escribir en medio no manda el cursor al final', async ({ page }) => {
    const campo = campoTelefono(page)
    await campo.fill('300123456')
    await expect(campo).toHaveValue('300 123 456')

    // Un «9» detras de «300»: la mascara reagrupa los diez digitos y el cursor
    // se queda pegado al digito recien escrito.
    await ponerCursor(campo, 3)
    await page.keyboard.type('9')
    await expect(campo).toHaveValue('300 912 3456')
    expect(await cursor(campo)).toBe(5)
  })

  test('borrar hasta vaciar el campo funciona digito a digito', async ({ page }) => {
    const campo = campoTelefono(page)
    await campo.fill('3001234567')

    await ponerCursor(campo, 12)
    for (let vuelta = 0; vuelta < 10; vuelta += 1) {
      await page.keyboard.press('Backspace')
    }
    await expect(campo).toHaveValue('')
  })

  test('un telefono demasiado corto se sigue rechazando aunque la mascara ponga un espacio', async ({
    page,
  }) => {
    await page.getByLabel('Nombre').fill(unique('Cliente corto'))
    await campoTelefono(page).fill('300123')
    await page.getByRole('button', { name: 'Crear cliente' }).click()

    await expect(page.getByText('Ingresa un teléfono válido (7 a 20 dígitos).')).toBeVisible()
    await expect(page).toHaveURL(/\/seller\/clients\/new/)
  })
})

test.describe('Lo que se guarda', () => {
  test('el formulario se envia y guarda exactamente lo que se veia', async ({ page }) => {
    const name = unique('Cliente mascara')

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients/new')
    await page.getByLabel('Nombre').fill(name)
    await campoTelefono(page).fill('3001234567')
    await expect(campoTelefono(page)).toHaveValue('300 123 4567')
    await page.getByRole('button', { name: 'Crear cliente' }).click()

    await closeClientCreatedDialog(page)
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name })).toBeVisible()

    const { data } = await serviceClient()
      .from('clients')
      .select('id, phone')
      .eq('name', name)
      .single()
    expect(data?.phone).toBe('300 123 4567')
    if (data?.id) clientesCreados.push(data.id)
  })

  /**
   * LA REGRESION QUE ORDENA TODO ESTE TRABAJO.
   *
   * Un cliente guardado con un formato antiguo, una edicion que no toca el
   * telefono, y la fila leida despues: si la mascara escribiera al pintar, aqui
   * apareceria «+57 300 123 4567» donde habia «+57 (300) 123-4567».
   */
  test('editar solo el alias de un cliente conserva su telefono historico intacto', async ({
    page,
  }) => {
    const HISTORICO = '+57 (300) 123-4567'
    const cliente = await createClientFor(
      refs,
      unique('Cliente historico'),
      refs.sellerId,
      HISTORICO,
    )
    clientesCreados.push(cliente.id)
    expect(cliente.phone).toBe(HISTORICO)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${cliente.id}/edit`)

    // Se ve legible, sin haberse guardado asi.
    await expect(campoTelefono(page)).toHaveValue('+57 300 123 4567')

    const alias = unique('Alias')
    await page.getByLabel('Alias (opcional)').fill(alias)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)
    await expect(page.getByText(alias)).toBeVisible()

    const { data } = await serviceClient()
      .from('clients')
      .select('phone, alias')
      .eq('id', cliente.id)
      .single()
    expect(data?.alias).toBe(alias)
    expect(data?.phone).toBe(HISTORICO)
  })

  test('guardar sin tocar nada no cambia el telefono', async ({ page }) => {
    const HISTORICO = '57 (310) 555-9988'
    const cliente = await createClientFor(refs, unique('Cliente intacto'), refs.sellerId, HISTORICO)
    clientesCreados.push(cliente.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${cliente.id}/edit`)
    await expect(campoTelefono(page)).toHaveValue('+57 310 555 9988')

    // Se guarda sin haber tocado un solo campo.
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)

    const { data } = await serviceClient()
      .from('clients')
      .select('phone')
      .eq('id', cliente.id)
      .single()
    expect(data?.phone).toBe(HISTORICO)
  })

  test('solo una edicion explicita del telefono adopta la forma nueva', async ({ page }) => {
    const cliente = await createClientFor(
      refs,
      unique('Cliente corregido'),
      refs.sellerId,
      '+57 (300) 123-4567',
    )
    clientesCreados.push(cliente.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${cliente.id}/edit`)
    await campoTelefono(page).fill('3009998877')
    await expect(campoTelefono(page)).toHaveValue('300 999 8877')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)

    const { data } = await serviceClient()
      .from('clients')
      .select('phone')
      .eq('id', cliente.id)
      .single()
    expect(data?.phone).toBe('300 999 8877')
  })
})

test.describe('El dialogo de vendedores y administradores', () => {
  test('usa la misma mascara al dar de alta', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/sellers')
    await page.getByRole('button', { name: 'Nuevo vendedor' }).click()

    const campo = campoTelefono(page)
    await campo.fill('3009998877')
    await expect(campo).toHaveValue('300 999 8877')
    await expect(campo).toHaveAttribute('inputmode', 'tel')
  })

  test('editar solo el alias de un vendedor conserva su telefono historico intacto', async ({
    page,
  }) => {
    const HISTORICO = '+57 (301) 222-3344'
    const nombre = unique('Vendedor historico')
    const vendedorId = await crearPersona({ nombre, telefono: HISTORICO, rol: 'seller' })

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/sellers')

    const fila = page.getByRole('row').filter({ hasText: nombre })
    await fila.getByRole('button', { name: `Acciones para ${nombre}` }).click()
    await page.getByRole('menuitem', { name: 'Editar datos' }).click()

    await expect(campoTelefono(page)).toHaveValue('+57 301 222 3344')

    const alias = unique('Alias')
    await page.getByLabel('Alias (opcional)').fill(alias)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText(alias)).toBeVisible()

    const despues = await filaPerfil(vendedorId)
    expect(despues.alias).toBe(alias)
    expect(despues.phone).toBe(HISTORICO)
  })
})

test.describe('El WhatsApp del catalogo', () => {
  test('se ve legible y se guarda en su forma canonica de solo digitos', async ({ page }) => {
    const svc = serviceClient()
    const { data: antes } = await svc
      .from('memberships')
      .select(
        'public_slug, public_catalog_enabled, public_whatsapp_number, public_raffle_id, updated_at',
      )
      .eq('profile_id', refs.sellerId)
      .eq('organization_id', refs.organizationId)
      .single()

    try {
      const { error } = await svc
        .from('memberships')
        .update({
          public_slug: 'catalogo-mascara-e2e',
          public_catalog_enabled: true,
          public_whatsapp_number: '573001234567',
          public_raffle_id: refs.raffleId,
        })
        .eq('profile_id', refs.sellerId)
        .eq('organization_id', refs.organizationId)
      expect(error).toBeNull()

      await loginAs(page, ACCOUNTS.owner)
      await page.goto(`/owner/sellers/${refs.sellerId}`)
      await page.getByRole('button', { name: 'Configurar catálogo' }).click()

      const campo = page.getByLabel('WhatsApp para recibir solicitudes')
      await expect(campo).toHaveValue('+57 300 123 4567')
      await expect(campo).toHaveAttribute('inputmode', 'tel')
      // No es el telefono de quien rellena el formulario: no se autocompleta.
      await expect(campo).toHaveAttribute('autocomplete', 'off')

      // Se guarda tal cual se ve, y la base recibe solo digitos (BR-K05).
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await expectToast(page, 'El catálogo quedó publicado.')

      const { data } = await svc
        .from('memberships')
        .select('public_whatsapp_number')
        .eq('profile_id', refs.sellerId)
        .eq('organization_id', refs.organizationId)
        .single()
      expect(data?.public_whatsapp_number).toBe('573001234567')
    } finally {
      // El seed se deja como estaba (docs/TESTING.md §2.1).
      await svc
        .from('memberships')
        .update({
          public_slug: antes?.public_slug ?? null,
          public_catalog_enabled: antes?.public_catalog_enabled ?? false,
          public_whatsapp_number: antes?.public_whatsapp_number ?? null,
          public_raffle_id: antes?.public_raffle_id ?? null,
        })
        .eq('profile_id', refs.sellerId)
        .eq('organization_id', refs.organizationId)
    }
  })
})

test.describe('La busqueda sigue encontrando los formatos historicos', () => {
  test('con y sin indicativo, con y sin separadores', async ({ page }) => {
    const sinSeparadores = await createClientFor(
      refs,
      unique('Buscable sin separadores'),
      refs.sellerId,
      '3105551111',
    )
    const conSeparadores = await createClientFor(
      refs,
      unique('Buscable con separadores'),
      refs.sellerId,
      '+57 (310) 555-2222',
    )
    clientesCreados.push(sinSeparadores.id, conSeparadores.id)

    await loginAs(page, ACCOUNTS.seller)

    const casos: [string, string[]][] = [
      [sinSeparadores.name, ['3105551111', '310 555 1111', '+57 310 555 1111', '573105551111']],
      [conSeparadores.name, ['3105552222', '310 555 2222', '+57 (310) 555-2222', '573105552222']],
    ]

    for (const [nombre, terminos] of casos) {
      for (const termino of terminos) {
        await page.goto(`/seller/clients?q=${encodeURIComponent(termino)}`)
        await expect(page.getByRole('link', { name: nombre }), `${nombre} / ${termino}`).toBeVisible()
      }
    }
  })
})

/** Lo justo de una fila para saber si alguien la escribio: el dato y su sello. */
async function filaCliente(id: string) {
  const { data, error } = await serviceClient()
    .from('clients')
    .select('name, alias, email, notes, phone, updated_at')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

async function filaPerfil(id: string) {
  const { data, error } = await serviceClient()
    .from('profiles')
    .select('full_name, alias, phone, updated_at')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/**
 * Una cuenta con el telefono en un formato ANTIGUO, que el formulario ya no
 * produce. Se crea con la service role porque es PREPARACION: lo que se prueba
 * —abrir, cerrar y editar— ocurre por la interfaz (D-043).
 */
async function crearPersona(opciones: {
  nombre: string
  telefono: string
  rol: 'admin' | 'seller'
  padre?: string
}): Promise<string> {
  const svc = serviceClient()
  const email = `mascara.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 7)}@demo.test`
  const { data: creado } = await svc.auth.admin.createUser({
    email,
    password: 'DesarrolloLocal2026',
    email_confirm: true,
    user_metadata: { full_name: opciones.nombre, phone: opciones.telefono },
  })
  const persona = creado?.user
  if (!persona) throw new Error('No se pudo crear la cuenta de prueba')
  vendedoresCreados.push(persona.id)

  const { error } = await svc.from('memberships').insert({
    organization_id: refs.organizationId,
    profile_id: persona.id,
    role: opciones.rol,
    parent_seller_id: opciones.padre ?? null,
  })
  if (error) throw error
  return persona.id
}

/**
 * «Mostrar no es guardar», en los CINCO caminos por los que un telefono vuelve a
 * la base: la ficha del cliente, el dialogo de personas del portal
 * administrativo —vendedor y administrador—, el del equipo del vendedor, que va
 * por otra RPC (`team_update_member`), y el WhatsApp del catalogo (arriba).
 *
 * `updated_at` es la prueba de que NADIE escribio: lo pone el disparador
 * `set_updated_at` en CUALQUIER actualizacion, asi que si no se mueve, no hubo
 * ninguna. Y cuando si se guarda, el telefono se compara caracter por caracter.
 */
test.describe('Un telefono guardado no se reescribe', () => {
  test('abrir el formulario, entrar y salir del campo e irse sin guardar no escribe nada', async ({
    page,
  }) => {
    const HISTORICO = '+57 (300) 123-4567'
    const cliente = await createClientFor(refs, unique('Cliente sin tocar'), refs.sellerId, HISTORICO)
    clientesCreados.push(cliente.id)
    const antes = await filaCliente(cliente.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${cliente.id}/edit`)

    const campo = campoTelefono(page)
    await expect(campo).toHaveValue('+57 300 123 4567')
    await campo.focus()
    await page.keyboard.press('Tab')
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page).not.toHaveURL(/\/edit$/)

    // Ni el telefono ni el sello: no hubo ni una escritura.
    expect(await filaCliente(cliente.id)).toEqual(antes)
  })

  test('cambiar TODOS los demas campos del cliente deja el telefono identico', async ({ page }) => {
    const HISTORICO = '(310) 555-0101'
    const cliente = await createClientFor(refs, unique('Cliente completo'), refs.sellerId, HISTORICO)
    clientesCreados.push(cliente.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${cliente.id}/edit`)
    await expect(campoTelefono(page)).toHaveValue('310 555 0101')

    const nombre = unique('Cliente renombrado')
    await page.getByLabel('Nombre').fill(nombre)
    await page.getByLabel('Alias (opcional)').fill('La vecina')
    await page.getByLabel('Correo (opcional)').fill('vecina@ejemplo.test')
    await page.getByLabel('Notas (opcional)').fill('Paga los viernes')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)

    const despues = await filaCliente(cliente.id)
    expect(despues).toMatchObject({
      name: nombre,
      alias: 'La vecina',
      email: 'vecina@ejemplo.test',
      notes: 'Paga los viernes',
      phone: HISTORICO,
    })
  })

  test('administrador: cerrar el dialogo no escribe, y cambiar su alias no toca el telefono', async ({
    page,
  }) => {
    const HISTORICO = '57 (315) 444-3322'
    const nombre = unique('Administrador historico')
    const id = await crearPersona({ nombre, telefono: HISTORICO, rol: 'admin' })
    const antes = await filaPerfil(id)

    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/users')
    const fila = page.getByRole('row').filter({ hasText: nombre })

    await fila.getByRole('button', { name: `Acciones para ${nombre}` }).click()
    await page.getByRole('menuitem', { name: 'Editar datos' }).click()
    await expect(campoTelefono(page)).toHaveValue('+57 315 444 3322')

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await filaPerfil(id)).toEqual(antes)

    await fila.getByRole('button', { name: `Acciones para ${nombre}` }).click()
    await page.getByRole('menuitem', { name: 'Editar datos' }).click()
    await page.getByLabel('Alias (opcional)').fill('Turno de la tarde')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, 'Datos actualizados.')

    const despues = await filaPerfil(id)
    expect(despues.alias).toBe('Turno de la tarde')
    expect(despues.phone).toBe(HISTORICO)
  })

  test('el vendedor que corrige a un integrante de su equipo no le reescribe el telefono', async ({
    page,
  }) => {
    const HISTORICO = '+57 (320) 777-6655'
    const id = await crearPersona({
      nombre: unique('Integrante historico'),
      telefono: HISTORICO,
      rol: 'seller',
      padre: refs.sellerId,
    })

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/team/${id}`)
    await page.getByRole('button', { name: 'Editar datos' }).click()

    const dialogo = page.getByRole('dialog')
    await expect(dialogo.getByLabel('Teléfono')).toHaveValue('+57 320 777 6655')

    const nombre = unique('Integrante corregido')
    await dialogo.getByLabel('Nombre completo').fill(nombre)
    await dialogo.getByLabel('Alias (opcional)').fill('El del barrio')
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, 'Datos actualizados.')

    const despues = await filaPerfil(id)
    expect(despues).toMatchObject({ full_name: nombre, alias: 'El del barrio', phone: HISTORICO })
  })
})

/**
 * Copiar y pegar DE VERDAD, con el portapapeles del sistema.
 *
 * `fill()` inserta el texto de una vez y se parece a pegar, pero no ES pegar: no
 * pasa por el portapapeles ni reemplaza una seleccion como lo hace el navegador.
 * Aqui se escribe en el portapapeles y se pulsa Ctrl+V, que es lo que hace una
 * persona.
 */
test.describe('Copiar y pegar con el portapapeles', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  async function alPortapapeles(page: Page, texto: string): Promise<void> {
    await page.evaluate((valor) => navigator.clipboard.writeText(valor), texto)
  }

  async function pegar(page: Page, campo: Locator, texto: string): Promise<void> {
    await alPortapapeles(page, texto)
    await campo.focus()
    await page.keyboard.press('ControlOrMeta+V')
  }

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients/new')
  })

  test('Ctrl+V con indicativo, parentesis y guion deja «+57 300 123 4567» y el cursor al final', async ({
    page,
  }) => {
    const campo = campoTelefono(page)
    await pegar(page, campo, '+57 (300) 123-4567')
    await expect(campo).toHaveValue('+57 300 123 4567')
    expect(await cursor(campo)).toBe(16)
  })

  test('pega lo que copia un contacto o WhatsApp, con sus marcas invisibles', async ({ page }) => {
    const campo = campoTelefono(page)
    // Android y WhatsApp envuelven el numero en marcas de direccion (U+202A y
    // U+202C) y a veces separan con espacios que no son el espacio normal
    // (U+00A0). No se ven; antes de la mascara, el formulario rechazaba por
    // ellas un numero perfectamente bueno.
    const casos: [string, string][] = [
      ['\u202A+57 300 1234567\u202C', '+57 300 123 4567'],
      ['300\u00A0123\u00A04567', '300 123 4567'],
      ['Tel: 300-123-4567', '300 123 4567'],
    ]
    for (const [pegado, visto] of casos) {
      await campo.fill('')
      await pegar(page, campo, pegado)
      await expect(campo, JSON.stringify(pegado)).toHaveValue(visto)
    }
  })

  test('pegar con todo seleccionado reemplaza el numero entero', async ({ page }) => {
    const campo = campoTelefono(page)
    await campo.fill('3001234567')
    await alPortapapeles(page, '(310) 999-8877')
    await campo.focus()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('ControlOrMeta+V')
    await expect(campo).toHaveValue('310 999 8877')
  })

  test('pegar en medio deja el cursor justo detras de lo pegado', async ({ page }) => {
    const campo = campoTelefono(page)
    await campo.fill('3001234')
    await expect(campo).toHaveValue('3001234')

    await alPortapapeles(page, '999')
    await ponerCursor(campo, 3)
    await page.keyboard.press('ControlOrMeta+V')
    await expect(campo).toHaveValue('300 999 1234')
    expect(await cursor(campo)).toBe(7)
  })

  test('copiar el campo entrega el numero legible, y pegarlo de vuelta lo deja igual', async ({
    page,
  }) => {
    const campo = campoTelefono(page)
    await campo.fill('3001234567')
    await campo.focus()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('ControlOrMeta+C')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('300 123 4567')

    await campo.fill('')
    await campo.focus()
    await page.keyboard.press('ControlOrMeta+V')
    await expect(campo).toHaveValue('300 123 4567')
  })

  test('pegar dos numeros juntos no pierde un digito, y el formulario no lo guarda', async ({
    page,
  }) => {
    const name = unique('Cliente dos numeros')
    await page.getByLabel('Nombre').fill(name)
    await pegar(page, campoTelefono(page), '300 123 4567 / 310 999 8877')

    // Los veinte digitos siguen ahi: la mascara no decide cual de los dos vale.
    await expect(campoTelefono(page)).toHaveValue('300 123 4567  310 999 8877')
    await page.getByRole('button', { name: 'Crear cliente' }).click()
    await expect(page.getByText('Ingresa un teléfono válido (7 a 20 dígitos).')).toBeVisible()
    await expect(page).toHaveURL(/\/seller\/clients\/new/)

    const { count } = await serviceClient()
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('name', name)
    expect(count).toBe(0)
  })

  test('pegar y guardar: la base recibe lo que se ve, y la busqueda lo encuentra', async ({
    page,
  }) => {
    const name = unique('Cliente pegado')
    await page.getByLabel('Nombre').fill(name)
    await pegar(page, campoTelefono(page), '\u202A+57 (310) 555-7777\u202C')
    await expect(campoTelefono(page)).toHaveValue('+57 310 555 7777')
    await page.getByRole('button', { name: 'Crear cliente' }).click()

    await closeClientCreatedDialog(page)
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)

    const { data } = await serviceClient()
      .from('clients')
      .select('id, phone')
      .eq('name', name)
      .single()
    expect(data?.phone).toBe('+57 310 555 7777')
    if (data?.id) clientesCreados.push(data.id)

    for (const termino of ['3105557777', '310 555 7777', '+57 310 555 7777', '573105557777']) {
      await page.goto(`/seller/clients?q=${encodeURIComponent(termino)}`)
      await expect(page.getByRole('link', { name }), termino).toBeVisible()
    }
  })
})
