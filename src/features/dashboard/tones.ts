/**
 * Los colores que significan algo en el panel del vendedor (D-112).
 *
 * El encargo pide una pantalla de blanco, negro y grises, con color SOLO donde
 * aporta significado. Estos son los unicos significados que lo justifican,
 * escritos una vez para que un grafico, una cifra y una barra que hablan del
 * mismo dinero no acaben de colores distintos:
 *
 *   paid    dinero ya cobrado;
 *   partial abonos: boletas pagadas a medias;
 *   unpaid  boletas de las que no ha entrado nada, que es lo que pide
 *           atencion;
 *   pending lo que falta por cobrar visto como parte del total. NO comparte
 *           color con «unpaid» a proposito: en el anillo del resumen es
 *           «todavia no», no «mal», y pintar de rojo la mitad de un grafico
 *           normal convierte una rifa que va bien en una alarma.
 *
 * Desde la Ola 6 cada significado sale del sistema de diseno y no de la paleta:
 * data/paid, data/partial, data/unpaid y data/pending para lo que se dibuja, y
 * los mismos con «-foreground» para lo que se escribe. Ya no hace falta repetir
 * cada color para el tema claro y el oscuro: el rol cambia solo.
 *
 * El color NUNCA va solo: cada cifra lleva su etiqueta escrita al lado, porque
 * ni el color ni un dibujo pueden ser la unica forma de conocer un dato
 * (CLAUDE.md §27).
 */
export type MoneyTone = 'paid' | 'partial' | 'unpaid' | 'pending'

/**
 * Un significado, DOS roles: uno para dibujar y otro para escribir.
 *
 * Los roles de relleno estan calibrados para manchas de color —el trozo de un
 * anillo, una barra, el trazo de una linea—, y ahi basta con distinguirse del
 * fondo. Una cifra escrita necesita mas: sobre la tarjeta, el verde de relleno
 * se queda en 3.35:1 y el gris en 2.58:1, por debajo del 4.5:1 que pide una
 * letra normal. Por eso cada significado tiene su rol «foreground», con un
 * valor de la MISMA familia de color, elegido para poder leerse.
 *
 * No es una duplicacion: son dos preguntas distintas con dos respuestas.
 */
export const TONE_TEXT: Record<MoneyTone, string> = {
  paid: 'text-data-paid-foreground',
  partial: 'text-data-partial-foreground',
  unpaid: 'text-data-unpaid-foreground',
  pending: 'text-data-pending-foreground',
}

export const TONE_FILL: Record<MoneyTone, string> = {
  paid: 'bg-data-paid',
  partial: 'bg-data-partial',
  unpaid: 'bg-data-unpaid',
  pending: 'bg-data-pending',
}

export const TONE_STROKE: Record<MoneyTone, string> = {
  paid: 'stroke-data-paid',
  partial: 'stroke-data-partial',
  unpaid: 'stroke-data-unpaid',
  pending: 'stroke-data-pending',
}
