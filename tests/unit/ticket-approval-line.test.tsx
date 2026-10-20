/**
 * La fila «Aprobada» de «Detalles de la boleta», la misma en los dos portales
 * (D-234, I-211).
 *
 * Solo `approve_tickets` escribe `approved_at`, y solo en las boletas que crea
 * un vendedor (BR-I09). Las del personal nacen listas y no tienen fecha. El
 * detalle del vendedor escribia «Todavía no» siempre que faltaba la fecha, asi
 * que toda boleta que le entregaba el personal parecia pendiente de aprobacion
 * (I-211). La regla es la que el detalle administrativo ya aplicaba (D-234), y
 * ahora vive en una sola pieza para los dos.
 *
 * Sin Testing Library, como el resto de pruebas de componente del proyecto:
 * `renderToStaticMarkup` basta para mirar el marcado.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ApprovalDetailLine } from '@/features/tickets/components/TicketDetailParts'
import type { TicketInventoryStatus } from '@/lib/constants'
import { formatDateEs, formatTimeEs } from '@/lib/dates'

function fila(approvedAt: string | null, inventoryStatus: TicketInventoryStatus): string {
  return renderToStaticMarkup(
    <ApprovalDetailLine approvedAt={approvedAt} inventoryStatus={inventoryStatus} />,
  )
}

describe('la fila «Aprobada» del detalle de una boleta (D-234, I-211)', () => {
  it('sin fecha y sin estar pendiente no se escribe: la boleta nunca necesitó aprobación', () => {
    // Lo que crea el personal —a mano, en lote o por rangos— en cualquiera de
    // los estados por los que pasa despues. Antes de I-211, el vendedor leia
    // «Todavía no» en todas.
    for (const status of ['draft', 'available', 'assigned', 'cancelled'] as const) {
      expect(fila(null, status), status).toBe('')
    }
  })

  it('una pendiente de aprobación dice «Todavía no»: es la única que la espera', () => {
    const markup = fila(null, 'pending_approval')
    expect(markup).toContain('Aprobada')
    expect(markup).toContain('Todavía no')
  })

  it('una boleta aprobada dice su fecha y su hora, se haya vendido, anulado o no', () => {
    const aprobadaEl = '2026-10-14T15:30:00.000Z'
    for (const status of ['available', 'assigned', 'cancelled'] as const) {
      const markup = fila(aprobadaEl, status)
      expect(markup, status).toContain('Aprobada')
      expect(markup, status).toContain(formatDateEs(aprobadaEl))
      expect(markup, status).toContain(formatTimeEs(aprobadaEl))
      expect(markup, status).not.toContain('Todavía no')
    }
  })
})
