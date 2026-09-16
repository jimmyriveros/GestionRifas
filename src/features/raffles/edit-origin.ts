/**
 * A dónde vuelve «Editar rifa» (D-202).
 *
 * El formulario es uno solo y se abre desde DOS sitios: el detalle de la rifa
 * («Editar») y el paso de premios del proceso de crearla («Volver a los datos
 * de la rifa»). Guardar, cancelar y la flecha vuelven a donde se abrió, así que
 * quien corrige los datos a mitad del proceso sigue dentro del proceso.
 *
 * EL ORIGEN ES UNA LISTA CERRADA. Viaja en `?from=` y solo cuenta si es uno de
 * los valores de abajo: cualquier otra cosa —vacío, una URL, una ruta escrita a
 * mano— vuelve al detalle, que es el destino de siempre. Y el destino se compone
 * con el id de la rifa que la página ya leyó con RLS, nunca con un texto
 * recibido: esto no puede convertirse en una redirección abierta. Es el mismo
 * patrón que `payments/return-to.ts` (D-135).
 */

export const RAFFLE_EDIT_ORIGINS = ['detail', 'prizes'] as const
export type RaffleEditOrigin = (typeof RAFFLE_EDIT_ORIGINS)[number]

/** El valor de `?from=`, contra la lista. Lo desconocido es el detalle. */
export function parseRaffleEditOrigin(value: string | string[] | undefined): RaffleEditOrigin {
  const first = Array.isArray(value) ? value[0] : value
  return (RAFFLE_EDIT_ORIGINS as readonly string[]).includes(first ?? '')
    ? (first as RaffleEditOrigin)
    : 'detail'
}

/** El enlace al formulario. Desde el detalle no lleva `from`: es el origen por defecto. */
export function raffleEditHref(raffleId: string, from: RaffleEditOrigin = 'detail'): string {
  const href = `/owner/raffles/${raffleId}/edit`
  return from === 'detail' ? href : `${href}?from=${from}`
}

/** A dónde vuelven guardar, cancelar y la flecha. */
export function raffleEditReturnHref(raffleId: string, from: RaffleEditOrigin): string {
  return from === 'prizes' ? `/owner/raffles/${raffleId}/prizes` : `/owner/raffles/${raffleId}`
}
