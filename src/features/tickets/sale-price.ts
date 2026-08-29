import { formatCOP } from '@/lib/money'

export type SalePriceRange = {
  /** Oficial congelado de ESTA venta: `coalesce(base_price, sale_price)`. */
  officialPrice: number
  /** Suelo de `ticket_sale_price_limits` (BR-P11). */
  minSalePrice: number
  /** Total abonado vigente. El nuevo precio no puede bajar de aqui (BR-P13). */
  paidAmount: number
}

/**
 * Por que no vale el precio escrito, en las palabras de quien lo escribio.
 *
 * Devuelve `null` cuando esta bien. Es lo MISMO que comprueba
 * `update_ticket_sale_price` (y, en el techo y el suelo, `assign_ticket_row`),
 * dicho antes de pulsar el boton para no gastarle un viaje al servidor a
 * alguien que solo se paso de rebaja o se metio por debajo de lo abonado.
 */
export function checkSalePrice(value: number | null, range: SalePriceRange): string | null {
  if (value === null || value <= 0) return 'Escribe el precio de venta.'
  if (value > range.officialPrice) {
    return `El precio de la rifa es ${formatCOP(range.officialPrice)}. Puedes vender más barato, no más caro.`
  }
  if (value < range.paidAmount) {
    return 'El precio de venta no puede ser menor que el total abonado de la boleta.'
  }
  if (value < range.minSalePrice) {
    return `Es más barato de lo que puedes rebajar. El precio más bajo es ${formatCOP(range.minSalePrice)}.`
  }
  return null
}
