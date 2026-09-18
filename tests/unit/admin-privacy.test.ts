import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  OWNER_REPORT_KEYS,
  REPORT_DESCRIPTIONS,
  reportDescription,
} from '@/features/reports/schemas'
import { adminTicketSearchEmptyDescription, adminTicketSearchHint } from '@/features/search/hints'
import {
  IMPORT_ABONO_NOT_ALLOWED,
  IMPORT_CLIENT_NOT_ALLOWED,
} from '@/features/tickets/import/review'
import { adminPaymentStateSchema, paymentStatusSchema } from '@/features/tickets/schemas'
import {
  whyNot,
  type BulkAction,
  type TicketEligibility,
} from '@/features/tickets/selection/eligibility'
import { findTour, TOURS } from '@/features/tour/tours'
import {
  ADMIN_TICKET_PAYMENT_STATE_LABELS,
  ADMIN_TICKET_PAYMENT_STATE_PLURAL_LABELS,
  ADMIN_TICKET_PAYMENT_STATE_VALUES,
  TICKET_PAYMENT_STATUS_LABELS,
  TICKET_PAYMENT_STATUS_PLURAL_LABELS,
} from '@/lib/constants'

/**
 * La cartera es del vendedor (D-198, BR-Q01..BR-Q10): lo que se puede comprobar
 * sin base de datos.
 *
 * Las reglas de acceso de verdad viven en SQL y las prueba
 * `tests/db/admin-privacy.test.ts`. Aqui van dos cosas: la logica pura que el
 * portal administrativo usa para hablarle al personal —dos estados de pago,
 * busqueda por numero, explicaciones que no nombran la cartera— y unas
 * invariantes ESTRUCTURALES, en la misma linea que `server-actions-guard`: que
 * nadie vuelva a abrir una puerta a la cartera sin que una prueba lo diga.
 */

const ROOT = process.cwd()

function leer(ruta: string): string {
  return readFileSync(join(ROOT, ruta), 'utf8')
}

/** Todos los `.ts` y `.tsx` bajo un directorio, a cualquier profundidad. */
function archivosBajo(dir: string): string[] {
  const encontrados: string[] = []
  for (const entrada of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const ruta = `${dir}/${entrada.name}`
    if (entrada.isDirectory()) encontrados.push(...archivosBajo(ruta))
    else if (/\.tsx?$/.test(entrada.name)) encontrados.push(ruta)
  }
  return encontrados
}

/** Los roles de `authorizeAction` de una Server Action exportada. */
function rolesDe(archivo: string, accion: string): string {
  const fuente = leer(archivo)
  const inicio = fuente.indexOf(`export async function ${accion}(`)
  expect(inicio, `${accion} en ${archivo}`).toBeGreaterThanOrEqual(0)
  const guarda = /authorizeAction\(\[([^\]]*)\]\)/.exec(fuente.slice(inicio))
  expect(guarda, `${accion} sin authorizeAction`).not.toBeNull()
  return guarda![1]!.replace(/\s/g, '')
}

describe('D-198 — dos estados de pago para el personal (BR-Q04)', () => {
  it('son dos, con las etiquetas de siempre, y el enum no cambia', () => {
    expect(ADMIN_TICKET_PAYMENT_STATE_VALUES).toEqual(['unpaid', 'paid'])
    expect(ADMIN_TICKET_PAYMENT_STATE_LABELS).toEqual({ unpaid: 'Sin pagar', paid: 'Pagada' })
    expect(ADMIN_TICKET_PAYMENT_STATE_LABELS.unpaid).toBe(TICKET_PAYMENT_STATUS_LABELS.unpaid)
    expect(ADMIN_TICKET_PAYMENT_STATE_LABELS.paid).toBe(TICKET_PAYMENT_STATUS_LABELS.paid)
    expect(ADMIN_TICKET_PAYMENT_STATE_PLURAL_LABELS).toEqual({
      unpaid: TICKET_PAYMENT_STATUS_PLURAL_LABELS.unpaid,
      paid: TICKET_PAYMENT_STATUS_PLURAL_LABELS.paid,
    })

    // «Abonada» sigue existiendo, pero es del vendedor.
    expect(TICKET_PAYMENT_STATUS_LABELS.partial).toBe('Abonada')
    expect(Object.values(ADMIN_TICKET_PAYMENT_STATE_LABELS)).not.toContain('Abonada')
    expect(Object.values(ADMIN_TICKET_PAYMENT_STATE_PLURAL_LABELS)).not.toContain('Abonadas')
  })

  it('«partial» no es un filtro del personal, aunque siga siendo del vendedor', () => {
    expect(adminPaymentStateSchema.safeParse('partial').success).toBe(false)
    expect(adminPaymentStateSchema.safeParse('unpaid').success).toBe(true)
    expect(adminPaymentStateSchema.safeParse('paid').success).toBe(true)
    expect(paymentStatusSchema.safeParse('partial').success).toBe(true)
  })
})

describe('D-198 — el personal busca solo por numero (BR-Q05)', () => {
  it('un nombre o un codigo interno reciben la pista, no una busqueda', () => {
    const soloNumeros = 'Escribe solo el número diario o el semanal de la boleta.'
    expect(adminTicketSearchHint('Jimmy')).toBe(soloNumeros)
    expect(adminTicketSearchHint('R001-000019')).toBe(soloNumeros)
    expect(adminTicketSearchHint('300 123 4567')).toBe(soloNumeros)
    expect(adminTicketSearchHint('12345')).toBe(
      'Los números de una boleta tienen 4 cifras como máximo.',
    )
    expect(adminTicketSearchHint('0717')).toBeUndefined()
    expect(adminTicketSearchHint('   ')).toBeUndefined()
  })

  it('la lista vacia dice lo mismo exista o no el nombre buscado, y no nombra clientes', () => {
    expect(adminTicketSearchEmptyDescription('Ana Torres', false)).toBe(
      adminTicketSearchEmptyDescription('Nadie Existe', false),
    )
    expect(adminTicketSearchEmptyDescription('0717', false)).toMatch(/número de la boleta/)
    expect(adminTicketSearchEmptyDescription(undefined, true)).toMatch(/limpiar los filtros/)
    expect(adminTicketSearchEmptyDescription(undefined, false)).toBeUndefined()

    for (const texto of [
      adminTicketSearchHint('Ana'),
      adminTicketSearchHint('12345'),
      adminTicketSearchEmptyDescription('Ana', true),
      adminTicketSearchEmptyDescription('0717', true),
    ]) {
      expect(texto).not.toMatch(/cliente|teléfono|celular/i)
    }
  })
})

describe('D-198 — por que el personal no puede, sin nombrar la cartera (BR-Q07)', () => {
  function fila(
    inventoryStatus: TicketEligibility['inventoryStatus'],
    can: Partial<Record<BulkAction, boolean>> = {},
  ): TicketEligibility {
    return {
      audience: 'staff',
      ticketId: 'boleta',
      dailyNumber: '0717',
      weeklyNumber: '4992',
      inventoryStatus,
      sellerId: 'vendedor',
      raffleId: 'rifa',
      raffleActive: true,
      can: {
        approve: false,
        assign: false,
        cancel: false,
        changeSeller: false,
        delete: false,
        ...can,
      },
    }
  }

  it('ninguna explicacion al personal habla de abonos, pagos, precios ni saldos', () => {
    const acciones: BulkAction[] = ['approve', 'assign', 'cancel', 'changeSeller', 'delete']
    for (const estado of [
      'draft',
      'pending_approval',
      'available',
      'assigned',
      'cancelled',
    ] as const) {
      for (const accion of acciones) {
        const texto = whyNot(fila(estado), accion)
        expect(texto, `${estado} / ${accion}`).not.toBe('')
        expect(texto, `${estado} / ${accion}`).not.toMatch(/abono|pago|precio|saldo|rebaja/i)
      }
    }
  })

  it('una vendida no se anula, y asignar a un cliente es de su vendedor', () => {
    expect(whyNot(fila('assigned'), 'cancel')).toBe('Ya está vendida y no se puede anular.')
    expect(whyNot(fila('available'), 'assign')).toBe(
      'Solo su vendedor puede asignarla a un cliente.',
    )
    expect(whyNot(fila('available', { cancel: true }), 'cancel')).toBe('')
  })
})

describe('D-198 — reportes del personal: solo recuentos (BR-Q08)', () => {
  it('el personal tiene tres reportes, y ninguna descripcion suya habla de dinero', () => {
    expect(OWNER_REPORT_KEYS).toEqual(['sellers', 'ticket-status', 'raffles'])
    for (const reporte of OWNER_REPORT_KEYS) {
      expect(reportDescription(reporte, 'staff'), reporte).not.toMatch(
        /vendido|ventas|recaud|saldo|dinero|cobr|abon/i,
      )
    }
  })

  it('el vendedor conserva las descripciones de siempre', () => {
    for (const reporte of [
      'raffles',
      'ticket-status',
      'sales-by-date',
      'client-balances',
      'payments',
    ] as const) {
      expect(reportDescription(reporte, 'seller'), reporte).toBe(REPORT_DESCRIPTIONS[reporte])
    }
  })
})

describe('D-198 — la importacion no vende (BR-Q07)', () => {
  it('las dos frases dicen que hacer, y no mandan a un portal que ya no importa ventas', () => {
    expect(IMPORT_CLIENT_NOT_ALLOWED).toMatch(/^Las boletas se importan sin cliente\./)
    expect(IMPORT_CLIENT_NOT_ALLOWED).toMatch(/Deja vacías las columnas «Cliente» y «Celular»/)
    expect(IMPORT_ABONO_NOT_ALLOWED).toMatch(/^Las boletas se importan sin abonos\./)
    expect(IMPORT_ABONO_NOT_ALLOWED).toMatch(/Deja vacía la columna «Abono»/)
    for (const texto of [IMPORT_CLIENT_NOT_ALLOWED, IMPORT_ABONO_NOT_ALLOWED]) {
      expect(texto).not.toMatch(/portal administrativo/i)
    }
  })
})

describe('D-198 — el recorrido guiado del personal no habla de la cartera', () => {
  it('ya no existe el recorrido de «Pagos»', () => {
    expect(TOURS.map((tour) => tour.id)).not.toContain('owner-payments')
    expect(findTour('/owner/payments', 'owner')).toBeNull()
  })

  it('ningun paso del portal administrativo habla de dinero, cobros ni clientes que ver', () => {
    for (const tour of TOURS.filter((recorrido) => recorrido.path.startsWith('/owner/'))) {
      for (const paso of tour.steps) {
        const texto = `${paso.title} ${paso.body}`
        expect(texto, `${paso.id} en ${tour.id}`).not.toMatch(
          /dinero|cobr|recaud|saldo|abono|vendido|pagos\b|los clientes/i,
        )
      }
    }
  })
})

describe('D-198 — ninguna puerta nueva a la cartera (invariantes estructurales)', () => {
  it('las rutas de clientes y pagos del portal administrativo ya no existen; las del vendedor, si', () => {
    expect(existsSync(join(ROOT, 'src/app/(protected)/owner/clients'))).toBe(false)
    expect(existsSync(join(ROOT, 'src/app/(protected)/owner/payments'))).toBe(false)
    expect(existsSync(join(ROOT, 'src/app/(protected)/seller/clients/page.tsx'))).toBe(true)
    expect(existsSync(join(ROOT, 'src/app/(protected)/seller/payments/page.tsx'))).toBe(true)
  })

  it('el menu del personal no ofrece Clientes ni Pagos; el del vendedor, si', () => {
    const personal = leer('src/app/(protected)/owner/layout.tsx')
    expect(personal).not.toMatch(/['"]\/owner\/clients/)
    expect(personal).not.toMatch(/['"]\/owner\/payments/)

    const vendedor = leer('src/app/(protected)/seller/layout.tsx')
    expect(vendedor).toMatch(/['"]\/seller\/clients['"]/)
    expect(vendedor).toMatch(/['"]\/seller\/payments['"]/)
  })

  it('ninguna pantalla del portal administrativo enlaza ni lee la cartera', () => {
    const PROHIBIDO = [
      /\/owner\/clients/,
      /\/owner\/payments/,
      /@\/features\/clients\//,
      /@\/features\/payments\//,
      /\blistTickets\b/,
      /\bgetTicketDetail\b/,
      /\bgetClientBalanceReport\b|\bgetPaymentReport\b|\bgetSalesByDateReport\b/,
      /v_seller_summary|v_client_balances|v_payment_history|v_ticket_balances/,
    ]
    for (const archivo of archivosBajo('src/app/(protected)/owner')) {
      const fuente = leer(archivo)
      for (const patron of PROHIBIDO) expect(fuente, `${archivo}: ${patron}`).not.toMatch(patron)
    }
  })

  it('el modelo administrativo de una boleta no declara cliente, precio, abonos ni saldo', () => {
    const PROHIBIDOS =
      /\b(client\w*|salePrice|basePrice|minSalePrice|paidAmount|pendingAmount|paymentStatus|hasClient|hasPayments|hasActivePayments)\b/

    const consultas = leer('src/features/tickets/admin-queries.ts')
    for (const tipo of ['AdminTicketListItem', 'AdminTicketDetail', 'InventoryCounts']) {
      const bloque = new RegExp(`export type ${tipo} = [^{]*\\{([\\s\\S]*?)\\n\\}`).exec(consultas)
      expect(bloque, tipo).not.toBeNull()
      expect(bloque![1], tipo).not.toMatch(PROHIBIDOS)
    }

    // La fila del personal es la base comun mas su publico, y nada mas.
    const elegibilidad = leer('src/features/tickets/selection/eligibility.ts')
    const base = /type EligibilityBase = \{([\s\S]*?)\n\}/.exec(elegibilidad)
    expect(base, 'EligibilityBase').not.toBeNull()
    expect(base![1]).not.toMatch(PROHIBIDOS)
    const staff = /export type AdminTicketEligibility = ([^\n]*)/.exec(elegibilidad)
    expect(staff![1]).toBe("EligibilityBase & { audience: 'staff' }")
  })

  it('las Server Actions de la cartera solo autorizan al vendedor', () => {
    const SOLO_VENDEDOR: [string, string[]][] = [
      ['src/features/payments/actions.ts', ['createPayment', 'updatePaymentAllocation']],
      [
        'src/features/clients/actions.ts',
        [
          'createClientRecord',
          'updateClientRecord',
          'setClientArchived',
          'searchClientOptions',
          'searchClientsWithBalance',
        ],
      ],
      ['src/features/tickets/assign/actions.ts', ['assignTickets', 'assignTicketsToNewClient']],
      [
        'src/features/tickets/actions.ts',
        [
          'updateTicketSalePrice',
          'searchTicketClientOptions',
          'reassignTicketClient',
          'reassignTicketToNewClient',
          'releaseTicket',
        ],
      ],
    ]

    for (const [archivo, acciones] of SOLO_VENDEDOR) {
      for (const accion of acciones) expect(rolesDe(archivo, accion), accion).toBe("'seller'")
    }

    // Y la de anular un pago ya no existe: nadie la podria llamar.
    expect(leer('src/features/payments/actions.ts')).not.toMatch(/voidPayment|void_payment'/)
  })

  it('el archivo CSV del personal sale de las mismas lecturas que su pantalla', () => {
    const exportacion = leer('src/features/reports/export.ts')
    expect(exportacion).toContain("if (audience === 'staff') return buildStaffReportCsv(filters)")

    const ruta = leer('src/app/api/reports/export/route.ts')
    // El publico sale de la sesion, nunca de la URL.
    expect(ruta).toMatch(/membership\.role === 'seller' \? 'seller' : 'staff'/)
  })
})

describe('D-208 — «Premios ganados» del personal, sin un solo dato de cliente (BR-J21)', () => {
  it('el tipo del personal no declara cliente, y la base común tampoco', () => {
    const consultas = leer('src/features/prize-awards/queries.ts')
    for (const tipo of ['PrizeAwardBase', 'AdminPrizeAward']) {
      const bloque = new RegExp(`export type ${tipo} = [^{]*\\{([\\s\\S]*?)\\n\\}`).exec(consultas)
      expect(bloque, tipo).not.toBeNull()
      expect(bloque![1], tipo).not.toMatch(/\bclient\w*/i)
    }
  })

  it('la lectura del personal pide SOLO sus dos proyecciones y copia columna a columna', () => {
    const consultas = leer('src/features/prize-awards/queries.ts')
    const inicio = consultas.indexOf('export async function readAdminPrizeAwards(')
    const fin = consultas.indexOf('export async function readAdminSellerPrizeTotals(')
    expect(inicio).toBeGreaterThan(0)
    expect(fin).toBeGreaterThan(inicio)
    const cuerpo = consultas.slice(inicio, fin)
    expect(cuerpo).toContain("rpc('admin_prize_awards'")
    expect(cuerpo).toContain("rpc('admin_prize_award_totals'")
    expect(cuerpo).not.toMatch(/seller_prize_award|\.from\(/)
    // Ni un `...row`: lo que la base añadiera no llegaría solo a la pantalla.
    expect(cuerpo).not.toMatch(/\.\.\.row\b/)
    expect(cuerpo).not.toMatch(/client_(id|name)|clientId|clientName/)
  })

  it('las pantallas del personal no importan la lectura del vendedor ni la de clientes', () => {
    const PROHIBIDO = [
      /\breadSellerPrizeAwards\b/,
      /\breadClientPrizeTotals\b/,
      /seller_prize_award/,
      /@\/features\/clients\//,
    ]
    for (const archivo of [
      'src/app/(protected)/owner/prizes/page.tsx',
      'src/app/(protected)/owner/sellers/[sellerId]/page.tsx',
      'src/features/prize-awards/components/SellerPrizeSummary.tsx',
    ]) {
      const fuente = leer(archivo)
      for (const patron of PROHIBIDO) expect(fuente, `${archivo}: ${patron}`).not.toMatch(patron)
    }
  })

  it('el filtro de cliente no existe en el portal del personal', () => {
    const filtros = leer('src/features/prize-awards/schemas.ts')
    expect(filtros).toMatch(/clientId: audience === 'seller' \? parsed\.clientId : undefined/)
    expect(filtros).toMatch(/sellerId: audience === 'staff' \? parsed\.sellerId : undefined/)
  })
})
