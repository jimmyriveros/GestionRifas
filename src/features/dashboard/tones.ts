/**
 * Los colores que significan algo en el panel del vendedor (D-112).
 *
 * El encargo pide una pantalla de blanco, negro y grises, con color SOLO donde
 * aporta significado. Estos son los unicos significados que lo justifican,
 * escritos una vez para que un grafico, una cifra y una barra que hablan del
 * mismo dinero no acaben de colores distintos:
 *
 *   paid    verde  dinero ya cobrado;
 *   partial azul   abonos: boletas pagadas a medias;
 *   unpaid  rojo   boletas de las que no ha entrado nada, que es lo que pide
 *                  atencion;
 *   pending gris   lo que falta por cobrar visto como parte del total. NO es
 *                  rojo a proposito: en el anillo del resumen es «todavia no»,
 *                  no «mal», y pintar de rojo la mitad de un grafico normal
 *                  convierte una rifa que va bien en una alarma.
 *
 * El color NUNCA va solo: cada cifra lleva su etiqueta escrita al lado, porque
 * ni el color ni un dibujo pueden ser la unica forma de conocer un dato
 * (CLAUDE.md §27).
 */
export type MoneyTone = 'paid' | 'partial' | 'unpaid' | 'pending'

export const TONE_TEXT: Record<MoneyTone, string> = {
  paid: 'text-emerald-600 dark:text-emerald-400',
  partial: 'text-blue-600 dark:text-blue-400',
  unpaid: 'text-red-600 dark:text-red-400',
  pending: 'text-muted-foreground',
}

export const TONE_FILL: Record<MoneyTone, string> = {
  paid: 'bg-emerald-600 dark:bg-emerald-400',
  partial: 'bg-blue-600 dark:bg-blue-400',
  unpaid: 'bg-red-600 dark:bg-red-400',
  pending: 'bg-muted-foreground/40',
}

export const TONE_STROKE: Record<MoneyTone, string> = {
  paid: 'stroke-emerald-600 dark:stroke-emerald-400',
  partial: 'stroke-blue-600 dark:stroke-blue-400',
  unpaid: 'stroke-red-600 dark:stroke-red-400',
  pending: 'stroke-muted-foreground/40',
}
