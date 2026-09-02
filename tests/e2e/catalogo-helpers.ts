import type { Page } from '@playwright/test'

import { createTicket, loadSeedRefs, serviceClient, type SeedRefs } from './db-setup'

/**
 * Preparacion compartida del catalogo publico (D-159).
 *
 * La usan las dos suites —escritorio y telefono—, que corren en proyectos
 * distintos de Playwright pero contra la MISMA base. Escribir el montaje dos
 * veces habria significado dos juegos de numeros que mantener en paralelo y,
 * antes o despues, dos que se pisan.
 *
 * Es PREPARACION con la service role: lo que cada prueba comprueba ocurre por
 * la interfaz, y sin sesion (docs/TESTING.md §2.1).
 */

export const CATALOG_SLUG = 'catalogo-e2e-k7m4'
export const CATALOG_WHATSAPP = '573001234567'

export const CATALOG_DISPONIBLES = ['6201', '6202', '6203'] as const
export const CATALOG_TOMADA = '6210'
export const CATALOG_OCULTAS = [
  { daily: '6220', estado: 'draft' as const },
  { daily: '6221', estado: 'pending_approval' as const },
  { daily: '6222', estado: 'cancelled' as const },
]

export type CatalogFixture = {
  refs: SeedRefs
  clienteId: string
  creadas: string[]
}

/** Enciende o apaga el catalogo del vendedor 1 sin tocar nada mas. */
export async function configurarCatalogo(refs: SeedRefs, enabled: boolean): Promise<void> {
  const { error } = await serviceClient()
    .from('memberships')
    .update({
      public_slug: CATALOG_SLUG,
      public_catalog_enabled: enabled,
      public_whatsapp_number: CATALOG_WHATSAPP,
      public_raffle_id: refs.raffleId,
    })
    .eq('profile_id', refs.sellerId)
    .eq('organization_id', refs.organizationId)
  if (error) throw error
}

/**
 * Deja el vendedor 1 con un catalogo publicado, tres boletas libres, una
 * vendida y una de cada estado que NO debe publicarse.
 */
export async function montarCatalogo(): Promise<CatalogFixture> {
  const refs = await loadSeedRefs()
  const svc = serviceClient()
  const creadas: string[] = []

  const { data: cliente, error: clienteError } = await svc
    .from('clients')
    .insert({
      organization_id: refs.organizationId,
      seller_id: refs.sellerId,
      name: 'Cliente Catalogo E2E',
      phone: '3005550001',
    })
    .select('id')
    .single()
  if (clienteError) throw clienteError

  for (const [i, daily] of CATALOG_DISPONIBLES.entries()) {
    const { id } = await createTicket(refs, {
      dailyNumber: daily,
      weeklyNumber: String(7200 + i),
      inventoryStatus: 'available',
    })
    creadas.push(id)
  }

  const { data: tomada, error: tomadaError } = await svc
    .from('tickets')
    .insert({
      organization_id: refs.organizationId,
      raffle_id: refs.raffleId,
      seller_id: refs.sellerId,
      daily_number: CATALOG_TOMADA,
      weekly_number: '7210',
      inventory_status: 'assigned',
      client_id: cliente!.id,
      sale_price: 120_000,
      sale_date: '2026-01-10',
      assigned_at: new Date().toISOString(),
      created_by: refs.sellerId,
    })
    .select('id')
    .single()
  if (tomadaError) throw tomadaError
  creadas.push(tomada!.id)

  for (const [i, oculta] of CATALOG_OCULTAS.entries()) {
    const { data, error } = await svc
      .from('tickets')
      .insert({
        organization_id: refs.organizationId,
        raffle_id: refs.raffleId,
        seller_id: refs.sellerId,
        daily_number: oculta.daily,
        weekly_number: String(7220 + i),
        inventory_status: oculta.estado,
        created_by: refs.sellerId,
        ...(oculta.estado === 'cancelled' ? { cancelled_at: new Date().toISOString() } : {}),
      })
      .select('id')
      .single()
    if (error) throw error
    creadas.push(data!.id)
  }

  await configurarCatalogo(refs, true)
  return { refs, clienteId: cliente!.id, creadas }
}

/** Devuelve la base al estado del seed. */
export async function desmontarCatalogo(fixture: CatalogFixture): Promise<void> {
  const svc = serviceClient()
  await svc
    .from('memberships')
    .update({
      public_slug: null,
      public_catalog_enabled: false,
      public_whatsapp_number: null,
      public_raffle_id: null,
    })
    .eq('profile_id', fixture.refs.sellerId)
  if (fixture.creadas.length > 0) await svc.from('tickets').delete().in('id', fixture.creadas)
  if (fixture.clienteId) await svc.from('clients').delete().eq('id', fixture.clienteId)
}

/** Abre una ruta SIN sesion: es como llega quien recibe el enlace. */
export async function abrirSinSesion(page: Page, path: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(path)
}

/* ---------------------------------------------------------------------------
 * La tarjeta «Mi catálogo público» del panel del vendedor (D-161).
 * ------------------------------------------------------------------------- */

/** Deja el catálogo apagado, o con su rifa cerrada, sin tocar nada más. */
export async function apagarCatalogo(refs: SeedRefs): Promise<void> {
  const { error } = await serviceClient()
    .from('memberships')
    .update({ public_catalog_enabled: false })
    .eq('profile_id', refs.sellerId)
  if (error) throw error
}

/** Cierra la rifa publicada: el interruptor sigue encendido y el enlace NO abre. */
export async function cerrarRifaPublicada(refs: SeedRefs, closed: boolean): Promise<void> {
  const { error } = await serviceClient()
    .from('raffles')
    .update({ status: closed ? 'closed' : 'active' })
    .eq('id', refs.raffleId)
  if (error) throw error
}

/**
 * Sustituye `navigator.share` y `navigator.clipboard` ANTES de que cargue la
 * página, para poder ejercer los cuatro caminos del botón «Compartir».
 *
 * Se hace con `addInitScript` y no pulsando de verdad porque el menú nativo del
 * sistema no existe en un navegador de pruebas: lo que se puede —y se debe—
 * comprobar es **qué le pide la aplicación al navegador** y **qué hace con cada
 * una de sus respuestas**.
 */
export type ShareMode = 'ok' | 'cancelled' | 'failed' | 'unsupported'
export type ClipboardMode = 'ok' | 'failed'

export async function stubShareAndClipboard(
  page: Page,
  { share, clipboard = 'ok' }: { share: ShareMode; clipboard?: ClipboardMode },
): Promise<void> {
  await page.addInitScript(
    ([shareMode, clipboardMode]: [ShareMode, ClipboardMode]) => {
      const w = window as unknown as { __share: unknown[]; __clipboard: string[] }
      w.__share = []
      w.__clipboard = []

      const fail = (name: string) => {
        const error = new Error(name)
        error.name = name
        throw error
      }

      if (shareMode === 'unsupported') {
        Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
      } else {
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: async (data: unknown) => {
            w.__share.push(data)
            if (shareMode === 'cancelled') fail('AbortError')
            if (shareMode === 'failed') fail('NotAllowedError')
          },
        })
      }

      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            if (clipboardMode === 'failed') fail('NotAllowedError')
            w.__clipboard.push(text)
          },
        },
      })
    },
    [share, clipboard] as [ShareMode, ClipboardMode],
  )
}

/** Lo que la aplicación le pasó a `navigator.share()`. */
export async function shareCalls(
  page: Page,
): Promise<{ title: string; text: string; url: string }[]> {
  return page.evaluate(() => (window as unknown as { __share: never[] }).__share)
}

/** Lo que la aplicación escribió en el portapapeles. */
export async function clipboardWrites(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __clipboard: string[] }).__clipboard)
}
