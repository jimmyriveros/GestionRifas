import { expect, test, type Page } from '@playwright/test'

import {
  createClientFor,
  createTicket,
  loadSeedRefs,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { SEARCH_OPTIONS_LIMIT } from '../../src/lib/search'
import { ACCOUNTS, loginAs, randomTicketNumbers, unique } from './fixtures'

/**
 * Busqueda hibrida (D-078, D-079): que busque sola al escribir, al momento con
 * `Enter`, y que ninguna de las dos cosas pise a la otra.
 *
 * Lo que se comprueba aqui no es «la busqueda encuentra» —eso ya lo cubren las
 * pruebas de cada pantalla— sino el COMPORTAMIENTO: cuantas peticiones salen,
 * cuando, en que orden y que pasa con las que llegan tarde.
 *
 * Las peticiones se cuentan mirando la navegacion real (el parametro `q` de la
 * URL), no un contador de `fetch`: en esta aplicacion la busqueda ES una
 * navegacion a un Server Component, y contar otra cosa seria medir un mecanismo
 * que no existe.
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

/**
 * Prefijo comun de todos los clientes que crea esta suite.
 *
 * Esta suite crea decenas de clientes —hace falta relleno para que el buscado
 * quede fuera del bloque inicial— y dejarlos ahi hace fallar a otras pruebas
 * que no aguantan datos acumulados (I-035, I-038). Con un prefijo unico se
 * borran todos de una vez al terminar el archivo.
 */
const PREFIJO = 'Zbusq'

function clienteDePrueba(nombre: string): string {
  return unique(`${PREFIJO} ${nombre}`)
}

/** Boletas creadas por esta suite, para no dejarlas acumuladas tampoco. */
const boletasCreadas: string[] = []

test.afterAll(async () => {
  if (boletasCreadas.length > 0) {
    await serviceClient().from('tickets').delete().in('id', boletasCreadas)
  }
  await serviceClient().from('clients').delete().like('name', `${PREFIJO}%`)
})

/** Cuenta cuantas veces cambia el parametro `q` de la URL. */
function trackSearchNavigations(page: Page): { count: () => number; terms: () => string[] } {
  const terms: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return
    const q = new URL(frame.url()).searchParams.get('q')
    if (q !== null && terms.at(-1) !== q) terms.push(q)
  })
  return { count: () => terms.length, terms: () => terms }
}

test.describe('Listas paginadas: boletas y clientes', () => {
  test('busca sola tras la pausa, sin una petición por tecla', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')

    const tracker = trackSearchNavigations(page)
    const input = page.getByRole('searchbox', { name: 'Buscar por número de boleta o por cliente' })

    // Cuatro teclas seguidas, mas rapido que el debounce. Son cuatro y no ocho
    // porque un numero de boleta tiene cuatro cifras como maximo (BR-N02).
    await input.pressSequentially('0100', { delay: 30 })
    await expect.poll(() => tracker.count()).toBeGreaterThan(0)
    await page.waitForTimeout(600)

    // Una sola busqueda para cuatro teclas. Sin debounce serian tres.
    expect(tracker.count()).toBe(1)
    expect(tracker.terms()[0]).toBe('0100')
    await expect(page).toHaveURL(/q=0100/)
  })

  test('Enter dispara la búsqueda por su cuenta, sin pasar por la pausa', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')

    const input = page.getByRole('searchbox', { name: 'Buscar por número de boleta o por cliente' })
    // `fill` pone el texto de una vez, sin teclear: no programa ningun debounce.
    // Asi la unica ruta posible hasta la busqueda es la de `Enter`.
    await input.fill('0100')
    await input.press('Enter')

    await expect(page).toHaveURL(/q=0100/)

    /*
      Aqui NO se cronometra. Medir «llegó antes de 350 ms» seria echar una
      carrera entre el debounce y una navegacion real, y con la maquina cargada
      la gana el debounce sin que nada este roto: la prueba fallaria por lentitud
      del entorno, no por el codigo.

      Que `Enter` no espera la pausa queda demostrado sin relojes por otras dos:
      «Enter y el debounce no producen dos busquedas» (si esperara, saldrian dos)
      y «por debajo del minimo no busca sola, pero Enter si» (ahi el debounce
      nunca llega a programarse, asi que la busqueda solo puede venir de `Enter`).
    */
  })

  test('Enter y el debounce no producen dos búsquedas del mismo término', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')

    const tracker = trackSearchNavigations(page)
    const input = page.getByRole('searchbox', { name: 'Buscar por número de boleta o por cliente' })

    await input.pressSequentially('0100', { delay: 30 })
    await input.press('Enter')
    // Tiempo de sobra para que el debounce hubiera saltado tambien.
    await page.waitForTimeout(800)

    expect(tracker.count()).toBe(1)
  })

  test('por debajo del mínimo no busca sola, pero Enter sí', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')

    const tracker = trackSearchNavigations(page)
    const input = page.getByRole('searchbox', { name: 'Buscar por número de boleta o por cliente' })

    await input.fill('7')
    await page.waitForTimeout(700)
    expect(tracker.count()).toBe(0)
    await expect(page.getByText(/Escribe al menos 2 caracteres/)).toBeVisible()

    // Quien tiene prisa no se queda encerrado por el minimo.
    await input.press('Enter')
    await expect(page).toHaveURL(/q=7/)
  })

  test('limpiar restaura la lista y quita el término de la dirección', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets?q=0100')

    const totalFiltrado = await page.locator('tbody tr').count()
    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click()

    await expect(page).not.toHaveURL(/q=/)
    await expect(
      page.getByRole('searchbox', { name: 'Buscar por número de boleta o por cliente' }),
    ).toHaveValue('')
    await expect.poll(() => page.locator('tbody tr').count()).toBeGreaterThanOrEqual(totalFiltrado)
  })

  test('el campo no pierde el foco mientras se busca', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets')

    const input = page.getByRole('searchbox', { name: 'Buscar por número de boleta o por cliente' })
    await input.click()
    await input.pressSequentially('010', { delay: 30 })
    await expect(page).toHaveURL(/q=010/)

    // Perder el foco aqui se traduce en teclas que no llegan al campo.
    await expect(input).toBeFocused()
    await input.pressSequentially('9', { delay: 30 })
    await expect(input).toHaveValue('0109')
  })

  test('cambiar el término vuelve a la primera página', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets?page=2')

    await page
      .getByRole('searchbox', { name: 'Buscar por número de boleta o por cliente' })
      .fill('0100')
    await page
      .getByRole('searchbox', { name: 'Buscar por número de boleta o por cliente' })
      .press('Enter')

    await expect(page).toHaveURL(/q=0100/)
    // Quedarse en la pagina 2 de otra busqueda muestra una lista vacia sin motivo.
    await expect(page).not.toHaveURL(/page=2/)
  })

  test('la búsqueda convive con los filtros: ninguno pisa al otro', async ({ page }) => {
    await loginAs(page, ACCOUNTS.owner)
    await page.goto('/owner/tickets?inventoryStatus=available')

    await page
      .getByRole('searchbox', { name: 'Buscar por número de boleta o por cliente' })
      .fill('0100')
    await page
      .getByRole('searchbox', { name: 'Buscar por número de boleta o por cliente' })
      .press('Enter')

    await expect(page).toHaveURL(/q=0100/)
    await expect(page).toHaveURL(/inventoryStatus=available/)
  })

  test('busca clientes por nombre sin tildes', async ({ page }) => {
    const nombre = clienteDePrueba('Jesús Peña')
    await createClientFor(refs, nombre)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto('/seller/clients')

    // Sin tildes: la columna normalizada de 0017 es la que lo permite.
    const input = page.getByRole('searchbox', { name: 'Buscar cliente' })
    await input.fill(nombre.replace('Jesús', 'jesus').replace('Peña', 'pena'))
    await input.press('Enter')
    await expect(page.getByRole('cell', { name: new RegExp(nombre) })).toBeVisible()
  })

  /**
   * Regresion de I-039, en las DOS direcciones de guardado.
   *
   * El defecto original solo se veia en una: buscar CON indicativo un telefono
   * guardado SIN el. La prueba anterior guardaba el telefono con separadores y
   * lo buscaba en digitos —la direccion que ya funcionaba—, y por eso el fallo
   * llego a produccion. Aqui se prueban los dos guardados contra los mismos
   * cuatro formatos de busqueda.
   */
  for (const guardado of ['3019998877', '+57 (301) 999-8877']) {
    test(`encuentra el teléfono guardado como «${guardado}» escrito de cuatro formas`, async ({
      page,
    }) => {
      const nombre = clienteDePrueba('Telefonista')
      const cliente = await createClientFor(refs, nombre)
      await serviceClient().from('clients').update({ phone: guardado }).eq('id', cliente.id)

      await loginAs(page, ACCOUNTS.seller)
      await page.goto('/seller/clients')
      const input = page.getByRole('searchbox', { name: 'Buscar cliente' })
      const fila = page.getByRole('cell', { name: new RegExp(nombre) })

      for (const escrito of ['3019998877', '+57 301 999-8877', '573019998877', '301 999 8877']) {
        await input.fill(escrito)
        await input.press('Enter')
        await expect(fila, `buscando «${escrito}»`).toBeVisible()
      }

      // Control: otro teléfono no debe traerlo.
      await input.fill('+57 (999) 999-9999')
      await input.press('Enter')
      await expect(fila).toHaveCount(0)
    })
  }
})

/**
 * Crea clientes de relleno hasta empujar al buscado fuera del bloque inicial.
 *
 * El orden importa: la lista viene ordenada por nombre, asi que el relleno
 * («Zbusq Relleno …») tiene que quedar ANTES que el cliente buscado
 * («Zbusq Zzz …») para empujarlo mas alla de las primeras 50 posiciones. Si los
 * dos prefijos se tocan, la prueba deja de demostrar lo que dice.
 *
 * Los borra el `afterAll` del archivo, junto con el resto (I-038).
 */
async function crearRelleno(cantidad: number): Promise<void> {
  // Una sola insercion, no sesenta. Con sesenta idas y vueltas esta suite
  // tardaba lo suficiente como para destapar una carrera de navegacion en
  // `payments.spec.ts` que no tiene nada que ver con la busqueda (I-038).
  const filas = Array.from({ length: cantidad }, (_, i) => ({
    organization_id: refs.organizationId,
    seller_id: refs.sellerId,
    name: `${PREFIJO} Relleno ${String(i).padStart(3, '0')}`,
    phone: '3009990000',
  }))
  const { error } = await serviceClient().from('clients').insert(filas)
  if (error) throw error
}

test.describe('Selector de cliente al asignar una boleta', () => {
  /**
   * Este bloque es el que justifica el cambio: antes se precargaban 200
   * clientes y se filtraba en memoria, asi que el cliente 201 era inencontrable
   * (I-036). Se comprueba con un cliente que NO esta en el primer bloque.
   */
  test('encuentra un cliente que no viene en el bloque inicial', async ({ page }) => {
    // El seed tiene pocos clientes, asi que cualquier nombre entraria en el
    // primer bloque y la prueba pasaria sin demostrar nada. Se crea relleno
    // suficiente para que el buscado quede FUERA de verdad, y se comprueba esa
    // condicion antes de buscar.
    await crearRelleno(SEARCH_OPTIONS_LIMIT + 10)

    // «Zzz» lo manda al final del orden alfabetico, detras de todo el relleno.
    const nombre = clienteDePrueba('Zzz Cliente Lejano')
    await createClientFor(refs, nombre)

    const numeros = randomTicketNumbers()
    const boleta = await createTicket(refs, {
      dailyNumber: numeros.daily,
      weeklyNumber: numeros.weekly,
      inventoryStatus: 'available',
    })
    boletasCreadas.push(boleta.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${boleta.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    // Condicion previa: sin buscar, NO esta. Sin esto la prueba pasaria aunque
    // la busqueda no hiciera nada, que es justo el fallo que vino a cubrir.
    await expect(page.getByRole('option').first()).toBeVisible()
    await expect(page.getByRole('option', { name: new RegExp(nombre) })).toHaveCount(0)

    const buscar = page.getByRole('searchbox', { name: 'Buscar', exact: true })
    await buscar.fill(nombre)
    await buscar.press('Enter')

    await expect(page.getByRole('option', { name: new RegExp(nombre) })).toBeVisible()
  })

  test('encuentra un nombre con tildes escribiéndolo sin ellas, y descarta el resto', async ({
    page,
  }) => {
    const nombre = clienteDePrueba('Zzñ Jesús Peña')
    await createClientFor(refs, nombre)

    const numeros = randomTicketNumbers()
    const boleta = await createTicket(refs, {
      dailyNumber: numeros.daily,
      weeklyNumber: numeros.weekly,
      inventoryStatus: 'available',
    })
    boletasCreadas.push(boleta.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${boleta.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    // El bloque inicial trae varios clientes; hay que ver que la lista se
    // estrecha de verdad. Comprobar solo que aparece el buscado no valdria: ya
    // podia venir en ese bloque inicial sin haber buscado nada.
    await expect(page.getByRole('option').nth(1)).toBeVisible()

    const buscar = page.getByRole('searchbox', { name: 'Buscar', exact: true })
    // Sin tilde en «Jesus», sin tilde en «Pena» y sin la ñ.
    await buscar.fill(
      nombre.replace('Zzñ', 'Zzn').replace('Jesús', 'jesus').replace('Peña', 'pena'),
    )

    // El nombre es unico, asi que la lista tiene que quedarse en UNA opcion: la
    // suya. Es lo que distingue «la busqueda funciono» de «la lista no cambio».
    await expect(page.getByRole('option')).toHaveCount(1)
    await expect(page.getByRole('option', { name: new RegExp(nombre) })).toBeVisible()
  })

  test('una respuesta lenta de un término anterior no pisa a la actual', async ({ page }) => {
    const lento = clienteDePrueba('Zza Lento')
    const rapido = clienteDePrueba('Zzb Rapido')
    await createClientFor(refs, lento)
    await createClientFor(refs, rapido)

    const numeros = randomTicketNumbers()
    const boleta = await createTicket(refs, {
      dailyNumber: numeros.daily,
      weeklyNumber: numeros.weekly,
      inventoryStatus: 'available',
    })
    boletasCreadas.push(boleta.id)

    await loginAs(page, ACCOUNTS.seller)

    // La PRIMERA busqueda que salga se retrasa 2 s; las siguientes van normales.
    // Asi la respuesta vieja llega despues que la nueva, que es justo el caso
    // que el testigo de secuencia tiene que descartar.
    let primera = true
    await page.route('**/seller/tickets/**', async (route) => {
      if (route.request().method() === 'POST' && primera) {
        primera = false
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      await route.continue()
    })

    await page.goto(`/seller/tickets/${boleta.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    const buscar = page.getByRole('searchbox', { name: 'Buscar', exact: true })
    await buscar.fill(lento)
    await buscar.press('Enter')
    await buscar.fill(rapido)
    await buscar.press('Enter')

    // Se espera a que la lenta haya tenido tiempo de volver.
    await page.waitForTimeout(3000)

    // Manda el ultimo termino escrito, no el ultimo en responder.
    await expect(page.getByRole('option', { name: new RegExp(rapido) })).toBeVisible()
    await expect(page.getByRole('option', { name: new RegExp(lento) })).toHaveCount(0)
  })

  test('no dice «ningún cliente coincide» mientras todavía está buscando', async ({ page }) => {
    const numeros = randomTicketNumbers()
    const boleta = await createTicket(refs, {
      dailyNumber: numeros.daily,
      weeklyNumber: numeros.weekly,
      inventoryStatus: 'available',
    })
    boletasCreadas.push(boleta.id)

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/tickets/${boleta.id}`)
    await page.getByRole('button', { name: 'Asignar a un cliente' }).click()

    const buscar = page.getByRole('searchbox', { name: 'Buscar', exact: true })
    await buscar.fill('zzzznoexiste')

    // Durante la busqueda, el mensaje de vacio no debe asomar: seria decir que
    // no hay nada antes de saberlo.
    await expect(page.getByText('Ningún cliente coincide')).toHaveCount(0)

    await buscar.press('Enter')
    await expect(page.getByText('Ningún cliente coincide')).toBeVisible()
  })
})
