import { expect, test, type Page } from '@playwright/test'

import { clipboardWrites, stubShareAndClipboard } from './catalogo-helpers'
import { loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'
import { ACCOUNTS, expectToast, loginAs } from './fixtures'

/**
 * «Configuración» del vendedor: cuentas para recibir pagos y recordatorios de
 * pago (BR-M01..BR-M09, BR-S01..BR-S07; D-185, D-188).
 *
 * Lo que se prueba aqui es lo que solo se ve en un navegador de verdad: que el
 * resumen no carga los formularios, que los campos cambian con el tipo de
 * cuenta, que el tope se explica cuando estorba, y —lo mas importante— que la
 * VISTA PREVIA del recordatorio enseña el mensaje completo con las cuentas ya
 * puestas y sin ningun marcador.
 *
 * El aislamiento por vendedor NO se prueba aqui: eso vive en la base y ya tiene
 * sus 62 pruebas (`tests/db/payment-accounts-reminders.test.ts`). Aqui se
 * comprueba lo que la base no puede ver.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/** Deja al vendedor sin nada: estas pruebas comparten cuenta con otras suites. */
async function reset(sellerId: string) {
  const svc = serviceClient()
  // ORDEN OBLIGATORIO: la ocurrencia apunta al recordatorio y a la campana con
  // `on delete restrict`, asi que se borra primero lo que apunta (0052).
  await svc.from('payment_reminder_occurrences').delete().eq('seller_id', sellerId)
  await svc.from('notifications').delete().eq('recipient_profile_id', sellerId)
  await svc.from('seller_payment_reminders').delete().eq('seller_id', sellerId)
  await svc.from('seller_payment_accounts').delete().eq('seller_id', sellerId)
  // Y el grupo de WhatsApp, que vive en la membresia (0050) y NO se borra con
  // lo anterior. Sin esto, la prueba de «sin grupo» dependeria de si la de
  // «abrir el grupo» corrio antes: el mismo cuidado que ya tiene
  // `whatsapp-invitacion.spec.ts` con este vendedor compartido.
  await svc
    .from('memberships')
    .update({
      whatsapp_group_url: null,
      whatsapp_use_custom_message: false,
      whatsapp_custom_message: null,
    })
    .eq('profile_id', sellerId)
}

test.beforeEach(async () => {
  await reset(refs.sellerId)
})

test.afterAll(async () => {
  await reset(refs.sellerId)
})

/**
 * Crea una cuenta por la interfaz, que es el camino que se quiere probar.
 *
 * Espera a que el DIALOGO se cierre y no al aviso: los avisos de `sonner` se
 * apilan, y en un bucle de cinco cuentas «La cuenta fue agregada.» coincide con
 * dos elementos a la vez y la aserción falla por ambigüedad, no por el producto.
 */
async function addNequi(page: Page, phone: string, holder = 'Ana Torres') {
  await page.getByRole('button', { name: 'Agregar cuenta' }).click()
  await page.getByLabel('Teléfono').fill(phone)
  await page.getByLabel('Titular').fill(holder)
  await page.getByRole('button', { name: 'Guardar cuenta' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test.describe('el resumen de Configuración', () => {
  test('lleva a las tres secciones y NO pinta ningun formulario', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings')

    await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible()

    // Las tres tarjetas, con el MISMO nombre que su pantalla.
    for (const name of [
      'Cuentas para recibir pagos',
      'Grupo de WhatsApp',
      'Recordatorios de pago',
    ]) {
      await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
    }

    // Lo que esta pantalla NO hace: cargar los formularios. Si alguno se colara
    // aqui, el resumen dejaria de ser ligero (D-185).
    await expect(page.getByRole('button', { name: 'Agregar cuenta' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Crear recordatorio' })).toHaveCount(0)
    await expect(page.getByLabel('Enlace del grupo de WhatsApp')).toHaveCount(0)

    // Sin nada configurado lo dice, en vez de enseñar un cero.
    await expect(page.getByText('Todavía no tienes cuentas')).toBeVisible()
    await expect(page.getByText('Todavía no tienes recordatorios')).toBeVisible()
  })

  test('la linea de estado cuenta bien, y en singular cuando hay una', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')
    await addNequi(page, '3001112233')

    await page.goto('/seller/settings')
    await expect(page.getByText('1 cuenta activa')).toBeVisible()

    await page.goto('/seller/settings/accounts')
    await addNequi(page, '3004445566')
    await page.goto('/seller/settings')
    await expect(page.getByText('2 cuentas activas')).toBeVisible()
  })
})

/*
 * QUIÉN PUEDE ENTRAR no se prueba aquí, y no es un olvido: las cuatro rutas se
 * añadieron a `RUTAS_PROTEGIDAS` de `security.spec.ts`, que ya comprueba las dos
 * cosas —que sin sesión redirigen al login y que el personal acaba en `/denied`—
 * para todas las rutas del producto. Duplicarlo aquí sería tener dos sitios
 * donde acordarse de añadir la siguiente.
 */

test.describe('cuentas para recibir pagos', () => {
  test('crea un Nequi y lo escribe en el orden en que se dicta', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')

    await expect(page.getByText('Todavía no tienes cuentas para recibir pagos')).toBeVisible()
    await addNequi(page, '3001112233', 'Ana Torres')
    await expectToast(page, 'La cuenta fue agregada.')

    // Donde · numero · titular (UX_COPY_GUIDELINES, Anexo A). Y el teléfono con
    // los separadores de D-184, porque el formulario los escribe.
    await expect(page.getByText('Nequi · 300 111 2233 · Ana Torres')).toBeVisible()
  })

  test('los campos cambian con el tipo, y el tipo NO se puede cambiar al editar', async ({
    page,
  }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')

    await page.getByRole('button', { name: 'Agregar cuenta' }).click()

    // Nequi: teléfono, y nada de banco.
    await expect(page.getByLabel('Teléfono')).toBeVisible()
    await expect(page.getByLabel('Banco')).toHaveCount(0)
    await expect(page.getByLabel('Número de cuenta')).toHaveCount(0)

    // Cuenta bancaria: banco, tipo y numero, y nada de teléfono.
    await page.getByRole('combobox', { name: '¿Dónde recibes el pago?' }).click()
    await page.getByRole('option', { name: 'Cuenta bancaria' }).click()
    await expect(page.getByLabel('Banco')).toBeVisible()
    await expect(page.getByLabel('Número de cuenta')).toBeVisible()
    await expect(page.getByLabel('Teléfono')).toHaveCount(0)

    await page.getByLabel('Banco').fill('Bancolombia')
    await page.getByRole('combobox', { name: 'Tipo de cuenta' }).click()
    await page.getByRole('option', { name: 'Ahorros' }).click()
    await page.getByLabel('Número de cuenta').fill('123-456-789')
    await page.getByLabel('Titular').fill('Ana Torres')
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect(page.getByText('Bancolombia · Ahorros · 123-456-789 · Ana Torres')).toBeVisible()

    // Al editar, el tipo es un dato y no una decision: se lee, no se elige.
    await page.getByRole('button', { name: 'Editar' }).click()
    await expect(page.getByRole('combobox', { name: '¿Dónde recibes el pago?' })).toHaveCount(0)
    await expect(page.getByText('Cuenta bancaria')).toBeVisible()
  })

  test('el nombre para reconocerla se ve en la lista y NO viaja al mensaje', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')

    await page.getByRole('button', { name: 'Agregar cuenta' }).click()
    await page.getByLabel('Teléfono').fill('3001112233')
    await page.getByLabel('Titular').fill('Ana Torres')
    await page.getByLabel('Nombre para reconocerla').fill('El Nequi de mi esposa')
    await page.getByRole('button', { name: 'Guardar cuenta' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect(page.getByText('El Nequi de mi esposa')).toBeVisible()

    // En el mensaje NO aparece: es del vendedor (UX_COPY_GUIDELINES).
    await page.goto('/seller/settings/reminders')
    await page.getByRole('button', { name: 'Crear recordatorio' }).click()
    const preview = page.getByText('Puedes pagar aquí:')
    await expect(preview).toBeVisible()
    await expect(page.getByText('El Nequi de mi esposa')).toHaveCount(0)
  })

  test('el tope se dice cuando estorba, no antes', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')

    for (let i = 1; i <= 4; i++) {
      await addNequi(page, `300111223${i}`)
      // Con menos de cinco NO hay ningun contador en pantalla (D-188).
      await expect(page.getByText(/Ya tienes 5 cuentas activas/)).toHaveCount(0)
    }

    await addNequi(page, '3001112239')
    // Al llegar al tope, el boton se apaga y dice por que.
    await expect(page.getByText('Ya tienes 5 cuentas activas. Archiva una para agregar otra.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agregar cuenta' })).toBeDisabled()
  })

  test('archivar la saca del listado y se puede volver a usar', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')
    await addNequi(page, '3001112233')

    await page.getByRole('button', { name: 'Archivar', exact: true }).click()
    await page.getByRole('button', { name: 'Archivar cuenta' }).click()
    await expectToast(page, 'La cuenta fue archivada.')

    await expect(page.getByText('Cuentas archivadas')).toBeVisible()
    await expect(page.getByText('Todavía no tienes cuentas para recibir pagos')).toBeVisible()

    await page.getByRole('button', { name: 'Volver a usar' }).click()
    await expectToast(page, 'La cuenta volvió a tu lista.')
    await expect(page.getByText('Cuentas archivadas')).toHaveCount(0)
  })

  test('«Subir» cambia el orden en que salen en el mensaje', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')
    await addNequi(page, '3001112233', 'Primera')
    await addNequi(page, '3004445566', 'Segunda')

    const items = page.getByRole('listitem')
    await expect(items.first()).toContainText('Primera')

    // La flecha de la segunda cuenta: su nombre accesible lleva el termino
    // entero, aunque a la vista solo haya un icono (D-114).
    await page.getByRole('button', { name: /^Subir/ }).nth(1).click()
    await expectToast(page, 'El orden fue guardado.')
    await expect(page.getByRole('listitem').first()).toContainText('Segunda')
  })
})

test.describe('recordatorios de pago', () => {
  test('crea uno y lo dice como se dice en voz alta', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/reminders')

    await expect(page.getByText('Todavía no tienes recordatorios de pago')).toBeVisible()

    await page.getByRole('button', { name: 'Crear recordatorio' }).click()
    await page.getByRole('combobox', { name: 'Día' }).click()
    await page.getByRole('option', { name: 'Martes' }).click()
    await page.getByLabel('Hora').fill('19:00')
    await page.getByRole('button', { name: 'Crear recordatorio' }).last().click()
    await expectToast(page, 'El recordatorio fue creado.')

    await expect(page.getByText('Martes a las 7:00 p. m.')).toBeVisible()
    await expect(page.getByText('Activo')).toBeVisible()
  })

  test('dos iguales se rechazan con una frase que se entiende', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/reminders')

    for (const _ of [1, 2]) {
      await page.getByRole('button', { name: 'Crear recordatorio' }).first().click()
      await page.getByRole('combobox', { name: 'Día' }).click()
      await page.getByRole('option', { name: 'Jueves' }).click()
      await page.getByLabel('Hora').fill('08:30')
      await page.getByRole('button', { name: 'Crear recordatorio' }).last().click()
    }

    await expect(page.getByRole('alert')).toContainText('Ya tienes un recordatorio ese día a esa hora')
  })

  test('pausar NO es archivar: el pausado se reanuda de un toque', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/reminders')

    await page.getByRole('button', { name: 'Crear recordatorio' }).click()
    await page.getByRole('button', { name: 'Crear recordatorio' }).last().click()
    await expectToast(page, 'El recordatorio fue creado.')

    await page.getByRole('button', { name: 'Pausar' }).click()
    await expectToast(page, 'El recordatorio quedó pausado.')
    await expect(page.getByText('Pausado')).toBeVisible()

    // Sigue en la lista, con su dia y su hora: pausar no pierde nada.
    await expect(page.getByRole('button', { name: 'Reanudar' })).toBeVisible()
    await page.getByRole('button', { name: 'Reanudar' }).click()
    await expectToast(page, 'El recordatorio volvió a estar activo.')
    await expect(page.getByText('Activo')).toBeVisible()
  })
})

test.describe('la vista previa del mensaje', () => {
  test('enseña el mensaje COMPLETO con las cuentas al final y sin marcadores', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')
    await addNequi(page, '3001112233', 'Ana Torres')

    await page.goto('/seller/settings/reminders')
    await page.getByRole('button', { name: 'Crear recordatorio' }).click()

    await expect(page.getByText('Así lo verán en tu grupo')).toBeVisible()
    // El encabezado le habla al CLIENTE, que es quien lo va a leer.
    await expect(page.getByText('Puedes pagar aquí:')).toBeVisible()
    await expect(page.getByText('• Nequi · 300 111 2233 · Ana Torres')).toBeVisible()

    // NO existe ningun marcador. Es la prueba de BR-S07: si alguien
    // reintrodujera `{{cuentas}}`, esto falla.
    const dialog = page.getByRole('dialog')
    await expect(dialog).not.toContainText('{{')
  })

  test('con mi propio mensaje, las cuentas se siguen agregando solas', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')
    await addNequi(page, '3001112233', 'Ana Torres')

    await page.goto('/seller/settings/reminders')
    await page.getByRole('button', { name: 'Crear recordatorio' }).click()
    await page.getByLabel('Usar mi propio mensaje').click()

    await page.getByLabel('Mensaje del recordatorio').fill('Buenas, no olviden su abono.')
    await expect(
      page.getByText('Escribe solo tu mensaje. Tus cuentas se agregan al final, siempre.'),
    ).toBeVisible()

    await expect(page.getByText('Buenas, no olviden su abono.')).toHaveCount(2) // campo y vista previa
    await expect(page.getByText('• Nequi · 300 111 2233 · Ana Torres')).toBeVisible()
  })

  test('sin cuentas lo dice FUERA del mensaje, con la salida a mano', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/reminders')
    await page.getByRole('button', { name: 'Crear recordatorio' }).click()

    // La vista previa no inventa un encabezado vacio.
    await expect(page.getByText('Puedes pagar aquí:')).toHaveCount(0)
    await expect(
      page.getByText('Todavía no tienes cuentas para recibir pagos, así que el mensaje sale sin ellas.'),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Agregar una cuenta' })).toBeVisible()
  })

  test('cambiar una cuenta cambia el mensaje sin tocar el recordatorio', async ({ page }) => {
    // Es BR-S08 mirado desde la pantalla: el mensaje se compone al abrirlo, no
    // se guarda con el recordatorio.
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')
    await addNequi(page, '3001112233', 'Ana Torres')

    await page.goto('/seller/settings/reminders')
    await page.getByRole('button', { name: 'Crear recordatorio' }).click()
    await page.getByRole('button', { name: 'Crear recordatorio' }).last().click()
    await expectToast(page, 'El recordatorio fue creado.')

    // Se corrige el titular de la cuenta, sin tocar el recordatorio.
    await page.goto('/seller/settings/accounts')
    await page.getByRole('button', { name: 'Editar' }).click()
    await page.getByLabel('Titular').fill('Ana María Torres')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, 'Los cambios fueron guardados.')

    // Y el mensaje del recordatorio ya sale con el nombre nuevo.
    await page.goto('/seller/settings/reminders')
    await page.getByRole('button', { name: 'Editar' }).click()
    await expect(page.getByText('• Nequi · 300 111 2233 · Ana María Torres')).toBeVisible()
  })
})

/*
 * =============================================================================
 * EL FLUJO COPIAR → ABRIR → ATENDER (BR-S14, D-189)
 *
 * Es donde se nota lo que Rifas NO hace: preparar el mensaje es todo su
 * trabajo; pegarlo y enviarlo lo hace una persona. Por eso aquí se comprueban
 * dos cosas que ninguna prueba de base de datos puede ver: QUÉ se copia de
 * verdad al portapapeles —el mensaje completo, con las cuentas al final— y que
 * ningún texto de la pantalla diga que se envió algo.
 *
 * El motor se dispara a mano con la RPC en vez de esperar al cron: una prueba
 * que espere hasta un minuto para empezar no es una prueba, es una pausa. Que
 * el cron lo llame solo cada minuto ya lo comprueban `verify-remote` y las
 * pruebas de catálogo.
 * =============================================================================
 */

/** Vence un recordatorio y lo procesa: deja una ocurrencia PENDIENTE de verdad. */
async function pendienteDeEnviar(refs: SeedRefs): Promise<void> {
  const svc = serviceClient()
  const { data: recordatorio, error } = await svc
    .from('seller_payment_reminders')
    .insert({
      organization_id: refs.organizationId,
      seller_id: refs.sellerId,
      weekday: 3,
      time_of_day: '19:00:00',
    })
    .select('id')
    .single()
  if (error) throw error

  // Se vence en un UPDATE aparte: el disparador del reloj solo recalcula al
  // insertar, al cambiar el horario o al reactivar, nunca en cualquier update.
  await svc
    .from('seller_payment_reminders')
    .update({ next_run_at: new Date(Date.now() - 20 * 60_000).toISOString() })
    .eq('id', recordatorio.id)

  await svc.rpc('process_due_payment_reminders', {})
}

/** Captura lo que la pantalla le pide al navegador al abrir el grupo. */
async function stubWindowOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __abiertas: string[] }
    w.__abiertas = []
    window.open = (url?: string | URL) => {
      w.__abiertas.push(String(url ?? ''))
      return window as unknown as Window
    }
  })
}

async function ventanasAbiertas(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __abiertas: string[] }).__abiertas)
}

test.describe('lo que hay para enviar', () => {
  test('lo que se copia es el mensaje COMPLETO, con las cuentas al final', async ({ page }) => {
    await stubShareAndClipboard(page, { share: 'unsupported', clipboard: 'ok' })
    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/settings/accounts')
    await addNequi(page, '3001112233', 'Ana Torres')
    await pendienteDeEnviar(refs)

    await page.goto('/seller/settings/reminders')
    await expect(page.getByRole('heading', { name: 'Para enviar ahora' })).toBeVisible()

    await page.getByRole('button', { name: 'Copiar mensaje' }).click()
    await expectToast(page, 'Mensaje copiado')

    const copiado = await clipboardWrites(page)
    expect(copiado).toHaveLength(1)
    // El encabezado le habla al CLIENTE, que es quien lo va a leer.
    expect(copiado[0]).toContain('Puedes pagar aquí:')
    expect(copiado[0]).toContain('• Nequi · 300 111 2233 · Ana Torres')
    // Y no queda ni rastro de un marcador (BR-S07).
    expect(copiado[0]).not.toContain('{{')
  })

  test('la pantalla NO dice en ningun sitio que el mensaje se envio', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await pendienteDeEnviar(refs)
    await page.goto('/seller/settings/reminders')

    const seccion = page.getByRole('region', { name: 'Para enviar ahora' })
    await expect(seccion.getByText('Rifas no lo envía por ti')).toBeVisible()
    for (const prohibido of ['Mensaje enviado', 'Enviado', 'Entregado', 'Se envió']) {
      await expect(seccion.getByText(prohibido, { exact: false })).toHaveCount(0)
    }
  })

  test('abrir el grupo abre el enlace del vendedor, y nada mas', async ({ page }) => {
    await stubWindowOpen(page)
    await loginAs(page, ACCOUNTS.seller)

    // Primero el grupo, para que la accion sea «Abrir grupo» y no la otra.
    await page.goto('/seller/settings/whatsapp')
    await page.getByLabel('Enlace del grupo de WhatsApp').fill('https://chat.whatsapp.com/AbCdEf123456')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expectToast(page, 'Los cambios fueron guardados.')

    await pendienteDeEnviar(refs)
    await page.goto('/seller/settings/reminders')
    await page.getByRole('button', { name: 'Abrir grupo' }).click()

    expect(await ventanasAbiertas(page)).toEqual(['https://chat.whatsapp.com/AbCdEf123456'])
  })

  test('sin grupo se ofrece configurarlo, no un boton que va a fallar', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await pendienteDeEnviar(refs)
    await page.goto('/seller/settings/reminders')

    const seccion = page.getByRole('region', { name: 'Para enviar ahora' })
    await expect(seccion.getByRole('button', { name: 'Abrir grupo' })).toHaveCount(0)
    await expect(seccion.getByRole('link', { name: 'Configurar WhatsApp' })).toBeVisible()
    await expect(seccion.getByText('Todavía no has configurado tu grupo')).toBeVisible()
  })

  test('marcarlo como atendido lo saca de la lista y del resumen', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await pendienteDeEnviar(refs)

    await page.goto('/seller/settings')
    await expect(page.getByText('1 para enviar')).toBeVisible()

    await page.goto('/seller/settings/reminders')
    await page.getByRole('button', { name: 'Marcar como atendido' }).click()
    await expectToast(page, 'Quedó marcado como atendido.')
    await expect(page.getByRole('heading', { name: 'Para enviar ahora' })).toHaveCount(0)

    // Y el recordatorio sigue ahi, intacto: atender no lo pausa ni lo archiva.
    await expect(page.getByText('Miércoles a las 7:00 p. m.')).toBeVisible()

    await page.goto('/seller/settings')
    await expect(page.getByText('para enviar')).toHaveCount(0)
    await expect(page.getByText('1 recordatorio activo')).toBeVisible()
  })

  test('el aviso de la campana lleva a donde se copia el mensaje', async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
    await pendienteDeEnviar(refs)
    await page.goto('/seller/dashboard')

    // La campanita es la fuente durable del aviso (BR-V01): sin este camino, el
    // recordatorio avisaria sin decir a donde ir.
    await page.getByRole('button', { name: /Novedades/ }).click()
    const aviso = page.getByRole('link', { name: /Es hora de tu recordatorio/ })
    await expect(aviso).toBeVisible()
    await aviso.click()

    await expect(page).toHaveURL(/\/seller\/settings\/reminders$/)
    await expect(page.getByRole('heading', { name: 'Para enviar ahora' })).toBeVisible()
  })
})
