import { describe, expect, it } from 'vitest'

import {
  canEditClearanceReceipt,
  CLEARANCE_COPY,
  clearanceDeliveredLabel,
  clearanceLabel,
  clearanceShortLabel,
  clearanceState,
  type ClearanceEligibility,
} from '@/features/tickets/clearance-receipt'
import { setTicketClearanceDeliverySchema } from '@/features/tickets/schemas'

const TICKET = '11111111-1111-4111-8111-111111111111'
const CLIENTE = '22222222-2222-4222-8222-222222222222'
const FECHA = '2026-09-05T16:13:16.360948+00:00'

const pendiente: ClearanceEligibility = {
  inventoryStatus: 'assigned',
  clientId: CLIENTE,
  clearanceDeliveredAt: null,
  clearanceAssumedDelivered: false,
}
const entregada: ClearanceEligibility = {
  ...pendiente,
  clearanceDeliveredAt: FECHA,
}
const heredada: ClearanceEligibility = {
  ...entregada,
  clearanceAssumedDelivered: true,
}

describe('clearanceState (BR-I15, D-170)', () => {
  it('una boleta vendida sin fecha está por entregar', () => {
    expect(clearanceState(pendiente)).toBe('pending')
  })

  it('con fecha y sin marca heredada es un registro manual', () => {
    expect(clearanceState(entregada)).toBe('delivered')
  })

  it('con fecha y marca heredada es la carga inicial', () => {
    expect(clearanceState(heredada)).toBe('assumed')
  })

  it('una boleta sin cliente no dice nada: no hay entrega de la que hablar', () => {
    for (const inventoryStatus of ['available', 'draft', 'pending_approval']) {
      expect(
        clearanceState({ ...pendiente, inventoryStatus, clientId: null }),
        inventoryStatus,
      ).toBeNull()
    }
  })

  it('una boleta anulada SÍ enseña lo que se le hubiera registrado (BR-I06)', () => {
    expect(clearanceState({ ...entregada, inventoryStatus: 'cancelled' })).toBe('delivered')
    expect(clearanceState({ ...heredada, inventoryStatus: 'cancelled' })).toBe('assumed')
    expect(clearanceState({ ...pendiente, inventoryStatus: 'cancelled' })).toBe('pending')
  })

  it('el estado no depende del pago: es exactamente el mismo dato', () => {
    // No hay ninguna entrada de pago en el tipo. Esta prueba es la que falla si
    // alguien la añade: el paz y salvo es un control de organización (BR-I15).
    expect(Object.keys(pendiente).sort()).toEqual([
      'clearanceAssumedDelivered',
      'clearanceDeliveredAt',
      'clientId',
      'inventoryStatus',
    ])
  })
})

describe('canEditClearanceReceipt (BR-I15)', () => {
  it('se puede mover sobre una boleta vendida', () => {
    expect(canEditClearanceReceipt(pendiente)).toBe(true)
    expect(canEditClearanceReceipt(entregada)).toBe(true)
    expect(canEditClearanceReceipt(heredada)).toBe(true)
  })

  it('no se puede sobre una boleta anulada: se lee, no se cambia', () => {
    expect(canEditClearanceReceipt({ ...entregada, inventoryStatus: 'cancelled' })).toBe(false)
  })

  it('no se puede sobre una boleta que todavía no se ha vendido', () => {
    for (const inventoryStatus of ['available', 'draft', 'pending_approval']) {
      expect(
        canEditClearanceReceipt({ ...pendiente, inventoryStatus, clientId: null }),
        inventoryStatus,
      ).toBe(false)
    }
  })
})

describe('los textos (UX_COPY_GUIDELINES)', () => {
  it('«paz y salvo» se escribe entero donde cabe, y se abrevia solo lo visible', () => {
    expect(clearanceLabel('delivered')).toBe('Paz y salvo entregado')
    expect(clearanceLabel('assumed')).toBe('Paz y salvo entregado')
    expect(clearanceLabel('pending')).toBe('Paz y salvo por entregar')

    expect(clearanceShortLabel('delivered')).toBe('Entregado')
    expect(clearanceShortLabel('assumed')).toBe('Entregado')
    expect(clearanceShortLabel('pending')).toBe('Por entregar')
  })

  it('un registro heredado NUNCA presenta una fecha', () => {
    expect(CLEARANCE_COPY.assumedNote).toBe(
      'Marcado como entregado al activar esta función. La fecha real de entrega no estaba registrada.',
    )
    expect(CLEARANCE_COPY.assumedNote).not.toMatch(/\d/)
  })

  it('la ayuda dice lo único que la pantalla no enseña: qué NO cambia', () => {
    expect(CLEARANCE_COPY.help).toBe(
      'Solo registra la entrega física. No cambia abonos, saldo ni estado de pago.',
    )
  })

  it('ningún texto llama «ticket» a la boleta ni habla de pago como si lo cambiara', () => {
    const textos = [
      CLEARANCE_COPY.title,
      CLEARANCE_COPY.help,
      CLEARANCE_COPY.delivered.long,
      CLEARANCE_COPY.delivered.short,
      CLEARANCE_COPY.pending.long,
      CLEARANCE_COPY.pending.short,
      CLEARANCE_COPY.assumedNote,
      CLEARANCE_COPY.saving,
      clearanceDeliveredLabel('5 sept 2026, 3:04 p. m.'),
    ]
    for (const texto of textos) {
      expect(texto, texto).not.toMatch(/ticket|comprador|owner|admin\b/i)
    }
  })

  it('la fecha se compone con la que le pasan, ya formateada en Bogotá', () => {
    expect(clearanceDeliveredLabel('5 sept 2026, 3:04 p. m.')).toBe(
      'Entregado el 5 sept 2026, 3:04 p. m.',
    )
  })
})

describe('setTicketClearanceDeliverySchema (D-170)', () => {
  it('acepta la fecha que devuelve PostgREST, con microsegundos y desfase', () => {
    const parsed = setTicketClearanceDeliverySchema.safeParse({
      ticketId: TICKET,
      delivered: false,
      expectedDeliveredAt: FECHA,
    })
    expect(parsed.success).toBe(true)
  })

  it('acepta `null`: es «la pantalla lo veía por entregar», no «no mandé nada»', () => {
    const parsed = setTicketClearanceDeliverySchema.safeParse({
      ticketId: TICKET,
      delivered: true,
      expectedDeliveredAt: null,
    })
    expect(parsed.success).toBe(true)
  })

  it('rechaza que falte la fecha esperada: sin ella no hay bloqueo optimista', () => {
    const parsed = setTicketClearanceDeliverySchema.safeParse({
      ticketId: TICKET,
      delivered: true,
    })
    expect(parsed.success).toBe(false)
  })

  it('rechaza una boleta que no es un identificador y una fecha inventada', () => {
    expect(
      setTicketClearanceDeliverySchema.safeParse({
        ticketId: 'la-de-jimmy',
        delivered: true,
        expectedDeliveredAt: null,
      }).success,
    ).toBe(false)
    expect(
      setTicketClearanceDeliverySchema.safeParse({
        ticketId: TICKET,
        delivered: true,
        expectedDeliveredAt: 'ayer',
      }).success,
    ).toBe(false)
  })

  it('NO admite una fecha nueva: esa la pone el servidor', () => {
    const parsed = setTicketClearanceDeliverySchema.safeParse({
      ticketId: TICKET,
      delivered: true,
      expectedDeliveredAt: null,
      deliveredAt: FECHA,
      assumedDelivered: true,
      organizationId: CLIENTE,
      sellerId: CLIENTE,
      role: 'owner',
    })
    expect(parsed.success).toBe(true)
    // Zod descarta lo que no está declarado: nada de eso llega a la RPC.
    expect(Object.keys(parsed.data!).sort()).toEqual([
      'delivered',
      'expectedDeliveredAt',
      'ticketId',
    ])
  })
})
