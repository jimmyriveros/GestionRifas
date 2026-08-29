import { expect, test } from '@playwright/test'

import {
  createClientFor,
  findOtherSellerResources,
  loadSeedRefs,
  serviceClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, expectToast, loginAs, unique } from './fixtures'

/**
 * Pruebas 1, 2, 3, 4 y 13 de la Fase 4: crear, editar, archivar y buscar
 * clientes, y el aislamiento entre vendedores (BR-C02, BR-C06, BR-C08, BR-U07).
 */

let refs: SeedRefs

test.beforeAll(async () => {
  refs = await loadSeedRefs()
})

test.describe('Clientes del vendedor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTS.seller)
  })

  test('crea un cliente con lo mínimo: nombre y teléfono (prueba 1)', async ({ page }) => {
    const name = unique('Cliente E2E')

    await page.goto('/seller/clients/new')
    await page.getByLabel('Nombre').fill(name)
    await page.getByLabel('Teléfono').fill('3001234567')
    await page.getByRole('button', { name: 'Crear cliente' }).click()

    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name })).toBeVisible()
    await expect(page.getByText('3001234567')).toBeVisible()
  })

  test('rechaza un cliente sin teléfono válido (BR-C02)', async ({ page }) => {
    await page.goto('/seller/clients/new')
    await page.getByLabel('Nombre').fill(unique('Cliente sin teléfono'))
    await page.getByLabel('Teléfono').fill('123')
    await page.getByRole('button', { name: 'Crear cliente' }).click()

    await expect(page.getByText('Ingresa un teléfono válido (7 a 20 dígitos).')).toBeVisible()
    await expect(page).toHaveURL(/\/seller\/clients\/new/)
  })

  test('rechaza un correo con formato inválido, pero lo acepta vacio', async ({ page }) => {
    await page.goto('/seller/clients/new')
    await page.getByLabel('Nombre').fill(unique('Cliente correo'))
    await page.getByLabel('Teléfono').fill('3001234567')
    await page.getByLabel('Correo (opcional)').fill('esto-no-es-un-correo')
    await page.getByRole('button', { name: 'Crear cliente' }).click()

    await expect(page.getByText('Ingresa un correo válido.')).toBeVisible()

    await page.getByLabel('Correo (opcional)').fill('')
    await page.getByRole('button', { name: 'Crear cliente' }).click()
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)
  })

  test('edita los datos de un cliente (prueba 2)', async ({ page }) => {
    const name = unique('Cliente editable')
    const client = await createClientFor(refs, name)

    await page.goto(`/seller/clients/${client.id}/edit`)
    const alias = unique('Alias')
    await page.getByLabel('Alias (opcional)').fill(alias)
    await page.getByLabel('Notas (opcional)').fill('Paga los viernes')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    await expectToast(page, 'Cliente actualizado.')
    await page.waitForURL(/\/seller\/clients\/[0-9a-f-]+$/)
    await expect(page.getByText(alias)).toBeVisible()
    await expect(page.getByText('Paga los viernes')).toBeVisible()
  })

  test('archiva y restaura un cliente (prueba 3, BR-C06)', async ({ page }) => {
    const client = await createClientFor(refs, unique('Cliente archivable'))

    await page.goto(`/seller/clients/${client.id}`)
    await page.getByRole('button', { name: 'Archivar cliente' }).click()
    await page.getByRole('button', { name: 'Archivar', exact: true }).click()

    await expectToast(page, 'Cliente archivado.')
    await expect(page.getByText(/Este cliente está archivado/)).toBeVisible()

    // Desaparece del listado por defecto y vuelve con el interruptor.
    await page.goto('/seller/clients')
    await expect(page.getByRole('link', { name: client.name })).toHaveCount(0)

    await page.getByLabel('Incluir archivados').click()
    await page.waitForURL(/archived=1/)
    await expect(page.getByRole('link', { name: client.name })).toBeVisible()

    await page.goto(`/seller/clients/${client.id}`)
    await page.getByRole('button', { name: 'Restaurar cliente' }).click()
    await page.getByRole('button', { name: 'Restaurar', exact: true }).click()
    await expectToast(page, 'Cliente restaurado.')
  })

  test('en escritorio la lista sigue siendo una tabla', async ({ page }) => {
    await page.goto('/seller/clients')

    await expect(page.getByRole('columnheader', { name: 'Cliente' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Saldo' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Clientes' })).toHaveCount(0)
  })

  test('busca por nombre, alias y teléfono (prueba 4, BR-C08)', async ({ page }) => {
    const name = unique('Buscable')
    const client = await createClientFor(refs, name)

    await page.goto('/seller/clients')
    await page.getByPlaceholder('Nombre, alias, teléfono o correo').fill(name)
    await page.getByRole('button', { name: 'Buscar' }).click()

    await page.waitForURL(/q=/)
    await expect(page.getByRole('link', { name: client.name })).toBeVisible()

    // Una busqueda que no coincide con nada deja el estado vacio explicito.
    await page.getByPlaceholder('Nombre, alias, teléfono o correo').fill('zzz-no-existe-zzz')
    await page.getByRole('button', { name: 'Buscar' }).click()
    await expect(page.getByText('Ningún cliente coincide con la búsqueda')).toBeVisible()
  })

  test('el listado no ofrece eliminar clientes, solo archivar (BR-C06)', async ({ page }) => {
    const client = await createClientFor(refs, unique('Cliente sin borrar'))

    await page.goto(`/seller/clients/${client.id}`)
    await expect(page.getByRole('button', { name: /eliminar|borrar/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Archivar cliente' })).toBeVisible()
  })
})

test.describe('Aislamiento entre vendedores (prueba 12)', () => {
  test('un vendedor no puede abrir el cliente de otro ni escribiendo la URL', async ({ page }) => {
    const { clientId } = await findOtherSellerResources(refs)
    test.skip(clientId === null, 'El seed no dejo clientes del otro vendedor')

    // El nombre real del cliente ajeno, para comprobar que NO aparece.
    const { data: ajeno } = await serviceClient()
      .from('clients')
      .select('name, phone')
      .eq('id', clientId!)
      .single()

    await loginAs(page, ACCOUNTS.seller)
    await page.goto(`/seller/clients/${clientId}`)

    // Se comprueba lo que importa: la pagina no revela NADA del cliente ajeno.
    // El codigo HTTP es 200 y no 404 porque el segmento tiene `loading.tsx`: la
    // respuesta ya iba en streaming cuando se resolvio `notFound()` (I-014).
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
    await expect(page.getByText(ajeno!.name)).toHaveCount(0)
    await expect(page.getByText(ajeno!.phone)).toHaveCount(0)
  })

  test('el listado de un vendedor no contiene clientes del otro', async ({ page }) => {
    await loginAs(page, ACCOUNTS.otherSeller)
    await page.goto('/seller/clients')

    // Los clientes del vendedor 1 en el seed son Ana Torres, Carlos Diaz y Beatriz Rojas.
    for (const ajeno of ['Ana Torres', 'Carlos Diaz', 'Beatriz Rojas']) {
      await expect(page.getByRole('link', { name: ajeno })).toHaveCount(0)
    }
  })
})
