import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeSearchTerm } from '@/lib/search'
import { createClient } from '@/lib/supabase/server'

import { isValidSlug } from './slug'
import { shortSellerName } from './whatsapp'

/**
 * Lectura del catalogo publico (BR-K07, BR-K08, D-159).
 *
 * ES LA UNICA LECTURA DEL PROYECTO QUE NO PASA POR LA RLS DE UNA SESION, y por
 * eso conviene entender exactamente por que es seguro:
 *
 *   * Quien la pide no tiene sesion. No hay `auth.uid()` del que colgar una
 *     politica, asi que la RLS no puede decidir nada.
 *   * Se llama con la clave de servicio, que efectivamente omite la RLS. Lo que
 *     acota lo que puede salir NO es la politica, es el TIPO DE RETORNO de las
 *     dos funciones de la migracion 0043: lo que no esta en su `returns table`
 *     no existe para esta capa. No hay `select *` que ampliar por descuido.
 *   * Ninguna de las dos acepta un vendedor, una organizacion ni una rifa como
 *     parametro. Lo unico que entra es el slug de la URL; a quien pertenece lo
 *     decide la base de datos. No hay id que manipular para saltar a otro
 *     vendedor.
 *
 * NO SE REUTILIZA `listTickets` NI `search_tickets` a proposito: las dos
 * devuelven cliente, codigo interno, precio y estado de pago, y las dos
 * dependen de `tickets_select`, que sin sesion no devuelve nada. Extenderlas
 * para el publico habria significado meter un modo «anonimo» en el camino de
 * datos que usan los dos portales.
 */

/**
 * Boletas por pagina.
 *
 * El encargo pide entre 50 y 60. Se piden `PAGE_SIZE + 1` a la base y la fila
 * sobrante SOLO sirve para saber si hay pagina siguiente: asi la pagina publica
 * nunca cuenta el inventario entero, que es lo caro (BR-K11).
 */
export const CATALOG_PAGE_SIZE = 50

export type PublicCatalogTicket = {
  dailyNumber: string
  weeklyNumber: string
  /** `true` = ya la tiene alguien. Es TODO lo que se sabe de una boleta vendida. */
  taken: boolean
}

export type PublicCatalog = {
  sellerName: string
  /** Como se le saluda en el mensaje de WhatsApp: alias, o su primer nombre. */
  sellerShortName: string
  whatsappNumber: string
  raffleName: string
  ticketPrice: number
  tickets: PublicCatalogTicket[]
  page: number
  hasNextPage: boolean
}

export type PublicCatalogRequest = {
  slug: string
  /** Lo escrito en el buscador. Solo 1 a 4 digitos puede coincidir (BR-N02). */
  search?: string
  page?: number
}

/**
 * El catalogo entero de una pagina: metadatos y boletas.
 *
 * Devuelve `null` cuando no hay nada que publicar, sin decir por que: slug
 * inexistente, vendedor inactivo, organizacion inactiva, catalogo apagado o
 * rifa cerrada dan todos el mismo resultado (BR-K10). Quien llame responde con
 * un «no encontrado» generico.
 *
 * DOS CONSULTAS, NO UNA POR TARJETA. Van en paralelo porque cada una resuelve
 * el slug por su cuenta —una busqueda por indice unico— y esperar a la primera
 * para lanzar la segunda solo anadiria una ida y vuelta.
 */
export async function getPublicCatalog({
  slug,
  search,
  page = 1,
}: PublicCatalogRequest): Promise<PublicCatalog | null> {
  // Un slug que ni siquiera tiene la forma de un slug no llega a la base de
  // datos: no puede existir, y asi la ruta absorbe la basura sin consultar.
  if (!isValidSlug(slug)) return null

  const currentPage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
  const term = normalizeSearchTerm(search ?? '')

  const supabase = createAdminClient()

  const [meta, rows] = await Promise.all([
    supabase.rpc('public_catalog_seller', { p_slug: slug }),
    supabase.rpc('public_catalog_tickets', {
      p_slug: slug,
      // La cadena vacia significa «sin filtro», igual que en el resto del
      // proyecto: se manda `undefined` para que la funcion use su valor nulo.
      p_search: term === '' ? undefined : term,
      p_limit: CATALOG_PAGE_SIZE + 1,
      p_offset: (currentPage - 1) * CATALOG_PAGE_SIZE,
    }),
  ])

  if (meta.error) throw meta.error
  if (rows.error) throw rows.error

  const seller = meta.data?.[0]
  if (!seller) return null

  const fetched = rows.data ?? []
  const hasNextPage = fetched.length > CATALOG_PAGE_SIZE

  return {
    sellerName: seller.seller_name,
    sellerShortName: shortSellerName(seller.seller_name, seller.seller_alias),
    whatsappNumber: seller.whatsapp_number,
    raffleName: seller.raffle_name,
    ticketPrice: Number(seller.ticket_price),
    tickets: fetched.slice(0, CATALOG_PAGE_SIZE).map((row) => ({
      dailyNumber: row.daily_number,
      weeklyNumber: row.weekly_number,
      taken: row.taken,
    })),
    page: currentPage,
    hasNextPage,
  }
}

/* ---------------------------------------------------------------------------
 * A partir de aqui, la CONFIGURACION del catalogo — y ya NO es lectura publica.
 *
 * Todo lo de abajo pasa por `createClient()`, el cliente sujeto a RLS, nunca
 * por el privilegiado de arriba. La politica `memberships_select` (0022) hace
 * el trabajo: el personal ve las membresias de su organizacion y un vendedor ve
 * SOLO la suya. Por eso `getCatalogSettings` no comprueba permisos a mano y aun
 * asi un vendedor no puede leer la configuracion de otro: pedirla devuelve cero
 * filas (BR-K12).
 * ------------------------------------------------------------------------- */

export type CatalogSettings = {
  slug: string | null
  enabled: boolean
  whatsappNumber: string | null
  raffleId: string | null
}

/**
 * La configuracion publica de un vendedor, o `null` si quien consulta no puede
 * verla. La distincion no la hace esta funcion: la hace la RLS.
 */
export async function getCatalogSettings(profileId: string): Promise<CatalogSettings | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memberships')
    .select('public_slug, public_catalog_enabled, public_whatsapp_number, public_raffle_id')
    .eq('profile_id', profileId)
    .eq('role', 'seller')
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    slug: data.public_slug,
    enabled: data.public_catalog_enabled,
    whatsappNumber: data.public_whatsapp_number,
    raffleId: data.public_raffle_id,
  }
}

/**
 * La direccion completa que se copia y se reparte.
 *
 * `NEXT_PUBLIC_SITE_URL` ya existe y es la misma que usan los enlaces de
 * invitacion y recuperacion (`features/users/actions.ts`): no se inventa otra
 * variable para lo mismo. Sin ella se devuelve la ruta relativa, que sigue
 * siendo util para comprobar la configuracion aunque no se pueda pegar.
 */
export function catalogPublicUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? ''
  return `${base}/catalogo/${slug}`
}
