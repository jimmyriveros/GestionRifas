/**
 * Las cifras del catalogo publico (D-164).
 *
 * Logica PURA y en un solo sitio: la usan la pagina (servidor), la franja de
 * estadisticas, la barra de progreso y las pruebas. Que el porcentaje se
 * calcule UNA vez es lo que garantiza que el numero escrito y el ancho de la
 * barra no puedan discrepar.
 */

export type CatalogStats = {
  /** Boletas `available` de todo el catalogo publicado. */
  available: number
  /** Boletas `assigned` de todo el catalogo publicado. */
  taken: number
  /** `available + taken`. No lo devuelve la base: se suma aqui, una vez. */
  total: number
}

/**
 * Que parte del catalogo ya tiene dueno, en porcentaje entero de 0 a 100.
 *
 * TRES PROTECCIONES, Y LAS TRES SON NECESARIAS:
 *
 *   * Un catalogo VACIO da `0`, no `NaN`. Dividir por cero produciria `NaN`, y
 *     `NaN` pintado en una barra da un ancho invalido que el navegador ignora,
 *     dejando una barra a medio pintar sin que nada falle a la vista.
 *   * Un conteo que no sea un numero finito —lo que llegaria si la base
 *     devolviera `null` y alguien lo convirtiera— se trata como cero.
 *   * El resultado se acota a [0, 100] aunque los datos vinieran mal: una barra
 *     al 120 % se sale de su caja y una al -5 % desaparece.
 *
 * Se redondea al entero: el texto dice «72 %» y la barra mide exactamente eso.
 */
export function percentageReserved({ taken, total }: { taken: number; total: number }): number {
  if (!Number.isFinite(taken) || !Number.isFinite(total) || total <= 0) return 0
  const bruto = Math.round((taken / total) * 100)
  return Math.min(100, Math.max(0, bruto))
}

/**
 * Arma las cifras a partir de los dos conteos que devuelve la base.
 *
 * `total` NO viaja desde SQL a proposito: si la base devolviera los tres
 * numeros, dos capas podrian discrepar el dia que una consulta cambie. Aqui hay
 * una sola definicion de `total`, y es una suma.
 */
export function catalogStats({ available, taken }: { available: number; taken: number }): CatalogStats {
  const disponibles = Number.isFinite(available) ? Math.max(0, available) : 0
  const tomadas = Number.isFinite(taken) ? Math.max(0, taken) : 0
  return { available: disponibles, taken: tomadas, total: disponibles + tomadas }
}
