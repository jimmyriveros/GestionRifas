import { expect, type Page, type Response } from '@playwright/test'

import {
  createAssignedTicket,
  loadSeedRefs,
  purgeTestData,
  serviceClient,
  signedInClient,
  type SeedRefs,
} from './db-setup'
import { ACCOUNTS, randomTicketNumbers } from './fixtures'

/**
 * El escenario de las pruebas de privacidad del portal administrativo (D-198,
 * BR-Q01..BR-Q10).
 *
 * Una boleta de `vendedor1`, vendida a un cliente con TODOS sus datos llenos y
 * con un abono parcial, de modo que cada dato de la cartera tenga un valor
 * inconfundible que buscar: nombre, alias, telefono, correo, notas e id del
 * cliente, precio de venta rebajado, abono, saldo y la nota del pago. Las
 * pruebas comprueban que ninguno llega al personal —ni en el HTML, ni en la
 * carga RSC, ni en una respuesta de red, ni en un CSV— y que el vendedor los
 * sigue viendo.
 *
 * Todo se PREPARA con la service role salvo el abono, que pasa por la RPC real
 * con la sesion del vendedor (D-043). No es un archivo de pruebas: lo usan
 * `privacidad-admin.spec.ts` y `privacidad-admin-movil.spec.ts`.
 */

/** Precio rebajado de la boleta: una cifra que no sale en ningun otro dato del seed. */
export const PRECIO_SECRETO = 96_350
/** Lo abonado. */
export const ABONO_SECRETO = 23_450
/** Lo que falta: $72.900. */
export const SALDO_SECRETO = PRECIO_SECRETO - ABONO_SECRETO

/** Fecha del abono, antigua a proposito: no mueve las listas de «lo reciente». */
const FECHA_ABONO = '2026-01-05'

export type CarteraSecreta = {
  refs: SeedRefs
  sellerName: string
  clientId: string
  ticketId: string
  numeros: { daily: string; weekly: string }
  nombre: string
  alias: string
  telefono: string
  correo: string
  notas: string
  notaDelPago: string
}

export async function crearCarteraSecreta(): Promise<CarteraSecreta> {
  const refs = await loadSeedRefs()
  const svc = serviceClient()
  const marca = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`

  const datos = {
    nombre: `Zafiro Privado ${marca}`,
    alias: `alias-zafiro-${marca}`,
    telefono: `31${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`,
    correo: `zafiro.${marca}@privado.test`,
    notas: `Nota privada del cliente ${marca}`,
    notaDelPago: `Nota privada del abono ${marca}`,
  }

  const { data: cliente, error } = await svc
    .from('clients')
    .insert({
      organization_id: refs.organizationId,
      seller_id: refs.sellerId,
      name: datos.nombre,
      alias: datos.alias,
      phone: datos.telefono,
      email: datos.correo,
      notes: datos.notas,
    })
    .select('id')
    .single()
  if (error) throw error

  const numeros = randomTicketNumbers()
  const ticket = await createAssignedTicket(refs, {
    dailyNumber: numeros.daily,
    weeklyNumber: numeros.weekly,
    clientId: cliente.id,
    salePrice: PRECIO_SECRETO,
  })

  const vendedor = await signedInClient(ACCOUNTS.seller)
  const { error: errorAbono } = await vendedor.rpc('create_payment', {
    p_client_id: cliente.id,
    p_total_amount: ABONO_SECRETO,
    p_allocations: [{ ticket_id: ticket.id, amount: ABONO_SECRETO }],
    p_payment_date: FECHA_ABONO,
    p_payment_method: 'cash',
    p_notes: datos.notaDelPago,
  })
  if (errorAbono) {
    await purgeTestData({ clientIds: [cliente.id], ticketIds: [ticket.id] })
    throw errorAbono
  }

  const { data: perfil, error: errorPerfil } = await svc
    .from('profiles')
    .select('full_name')
    .eq('id', refs.sellerId)
    .single()
  if (errorPerfil) throw errorPerfil

  return {
    refs,
    sellerName: perfil.full_name,
    clientId: cliente.id,
    ticketId: ticket.id,
    numeros,
    ...datos,
  }
}

/** Borra el escenario: pago, asignacion, boleta y cliente, en una transaccion (I-035). */
export async function borrarCarteraSecreta(cartera: CarteraSecreta | undefined): Promise<void> {
  if (!cartera) return
  await purgeTestData({ clientIds: [cartera.clientId], ticketIds: [cartera.ticketId] })
}

/** 96350 → «96.350», como lo escribe `formatCOP`. */
function conPuntos(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Una cifra de la cartera, con limites a los dos lados.
 *
 * Sin ellos, «23450» apareceria dentro de un uuid, del nombre de un fragmento de
 * JavaScript o de otro numero, y la prueba fallaria sin que nada se hubiera
 * filtrado. Con ellos sigue apareciendo donde de verdad importa: `"precio":96350`
 * en una carga RSC o `$96.350` en un HTML.
 */
function patronesDe(n: number): RegExp[] {
  return [String(n), conPuntos(n)].map(
    (texto) => new RegExp(`(?<![0-9A-Za-z_./-])${texto.replace('.', '\\.')}(?![0-9A-Za-z_-])`),
  )
}

/**
 * Los datos de la cartera que aparecen en un texto recibido por el navegador.
 *
 * `excluir` deja fuera lo que escribio la propia prueba —un termino de busqueda,
 * un id en la direccion—: eso vuelve en el campo y en la URL, y no es una fuga.
 */
export function secretosEn(
  texto: string,
  cartera: CarteraSecreta,
  excluir: readonly string[] = [],
): string[] {
  const telefonoConEspacios = `${cartera.telefono.slice(0, 3)} ${cartera.telefono.slice(3, 6)} ${cartera.telefono.slice(6)}`
  const literales = [
    cartera.nombre,
    cartera.alias,
    cartera.correo,
    cartera.notas,
    cartera.notaDelPago,
    cartera.clientId,
    cartera.telefono,
    telefonoConEspacios,
  ].filter((valor) => !excluir.includes(valor))

  const hallados = literales.filter((valor) => texto.includes(valor))
  for (const cifra of [PRECIO_SECRETO, ABONO_SECRETO, SALDO_SECRETO]) {
    for (const patron of patronesDe(cifra)) {
      if (patron.test(texto)) hallados.push(`la cifra ${patron.source}`)
    }
  }
  return hallados
}

export function expectSinSecretos(
  texto: string,
  cartera: CarteraSecreta,
  donde: string,
  excluir: readonly string[] = [],
): void {
  expect(
    secretosEn(texto, cartera, excluir),
    `${donde}: la cartera del vendedor llegó al navegador del personal`,
  ).toEqual([])
}

/** El servidor de la aplicacion y la API de Supabase: todo lo que el navegador puede recibir. */
const ORIGENES = ['http://localhost:3000', 'http://127.0.0.1:54321']
const TIPOS_DE_TEXTO = /text\/html|text\/x-component|application\/json|text\/csv|text\/plain/

/**
 * Guarda el cuerpo de todo lo que recibe la pagina desde que se llama: el HTML,
 * la carga RSC de cada navegacion, las Server Actions y cualquier JSON o CSV.
 *
 * Es donde se filtraria un dato que la pantalla no pinta. Los fragmentos de
 * JavaScript quedan fuera: son codigo de la aplicacion, no datos de nadie.
 */
export function registrarRespuestas(page: Page): {
  texto: () => Promise<string>
  detener: () => void
} {
  const cuerpos: string[] = []
  const pendientes: Promise<unknown>[] = []

  const alRecibir = (response: Response) => {
    if (!ORIGENES.some((origen) => response.url().startsWith(origen))) return
    if (!TIPOS_DE_TEXTO.test(response.headers()['content-type'] ?? '')) return
    pendientes.push(
      response.text().then(
        (cuerpo) => cuerpos.push(cuerpo),
        // Una redireccion no tiene cuerpo que leer.
        () => undefined,
      ),
    )
  }

  page.on('response', alRecibir)
  return {
    texto: async () => {
      await Promise.all(pendientes)
      return cuerpos.join('\n')
    },
    detener: () => {
      page.off('response', alRecibir)
    },
  }
}

/** Descarga un CSV de reportes con la sesion del navegador. */
export async function descargarCsv(
  page: Page,
  query: string,
): Promise<{ status: number; body: string }> {
  return page.evaluate(async (q) => {
    const response = await fetch(`/api/reports/export?${q}`)
    return { status: response.status, body: await response.text() }
  }, query)
}
