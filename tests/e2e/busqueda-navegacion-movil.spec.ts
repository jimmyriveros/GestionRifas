import { test } from '@playwright/test'

import { loadSeedRefs } from './db-setup'
import { ACCOUNTS, loginAs } from './fixtures'
import { abrirDuranteLaPausa, esperarHidratado } from './navegacion-helpers'

/**
 * Una búsqueda a medio escribir no cancela la navegación que la persona acaba
 * de elegir (I-199, D-245), en el teléfono: la misma carrera que
 * `busqueda-navegacion.spec.ts`, con el dedo y sobre las tarjetas.
 *
 * Se escribe, se toca la tarjeta antes de que venzan los 350 ms y la respuesta
 * del destino se retrasa 1,5 s: tiene que verse el destino elegido, quedarse
 * ahí, y no haber salido ninguna búsqueda.
 *
 * Usa el seed y solo navega: no escribe nada.
 */

let lista = ''

test.beforeAll(async () => {
  const refs = await loadSeedRefs()
  lista = `/owner/settlements?raffleId=${refs.raffleId}`
})

test('cierre de cuentas: tocar la tarjeta durante la pausa abre esa cuenta y se queda', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.owner)
  await page.goto(lista)
  const tarjeta = page
    .getByRole('list', { name: 'Cuentas de los vendedores' })
    .getByRole('link')
    .first()
  await esperarHidratado(tarjeta)
  const nombre = (await tarjeta.getAttribute('aria-label'))!.replace('Revisar la cuenta de ', '')
  const destino = new URL((await tarjeta.getAttribute('href'))!, 'http://x').pathname

  await abrirDuranteLaPausa(page, {
    campo: page.getByLabel('Buscar vendedor'),
    termino: nombre.slice(0, 2),
    listaPath: '/owner/settlements',
    destino,
    abrir: () => tarjeta.tap(),
    titulo: page.getByRole('heading', { level: 1, name: `Cuenta de ${nombre}` }),
  })
})

test('mis clientes: tocar la tarjeta —que navega con router.push— durante la pausa abre ese cliente', async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.seller)
  await page.goto('/seller/clients')
  const tarjeta = page.getByRole('list', { name: 'Clientes' }).getByRole('listitem').first()
  const enlace = tarjeta.getByRole('link')
  await esperarHidratado(tarjeta)
  const nombre = (await enlace.innerText()).trim()
  const destino = new URL((await enlace.getAttribute('href'))!, 'http://x').pathname
  const caja = (await tarjeta.boundingBox())!

  await abrirDuranteLaPausa(page, {
    campo: page.getByLabel('Buscar cliente'),
    termino: nombre.slice(0, 2),
    listaPath: '/seller/clients',
    destino,
    // Fuera del nombre, que es un enlace: abre la tarjeta su `router.push`.
    abrir: () => tarjeta.tap({ position: { x: caja.width - 24, y: caja.height / 2 } }),
    titulo: page.getByRole('heading', { level: 1, name: nombre }),
  })
})
