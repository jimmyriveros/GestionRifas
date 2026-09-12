import { describe, expect, it } from 'vitest'

import type { PaymentAccount } from '@/features/payment-accounts/accounts'
import {
  accountsBlock,
  activeReminderBody,
  buildReminderMessage,
  countActive,
  DEFAULT_REMINDER_MESSAGE,
  PAYMENT_REMINDER_MAX,
  REMINDER_COPY,
  reminderSchedule,
  sortOccurrences,
  sortReminders,
  type PaymentReminder,
} from '@/features/payment-reminders/reminders'
import {
  paymentReminderSchema,
  toMinutePrecision,
} from '@/features/payment-reminders/schemas'
import { formatClockEs } from '@/lib/dates'

/**
 * El mensaje de un recordatorio (BR-S06..BR-S09, D-188).
 *
 * La prueba que mas importa es la de los marcadores: BR-S07 dice que las
 * cuentas se añaden SOLAS al final y que no existe ningun `{{cuentas}}`. Si
 * alguien reintrodujera uno, aqui se cae.
 */

function reminder(overrides: Partial<PaymentReminder> = {}): PaymentReminder {
  return {
    id: 'r1',
    weekday: 2,
    timeOfDay: '19:00:00',
    status: 'active',
    useCustomMessage: false,
    customMessage: null,
    ...overrides,
  }
}

function account(overrides: Partial<PaymentAccount> = {}): PaymentAccount {
  return {
    id: 'a1',
    kind: 'nequi',
    holderName: 'Ana Torres',
    phone: '300 123 4567',
    bankName: null,
    accountType: null,
    accountNumber: null,
    label: null,
    sortOrder: 1,
    archivedAt: null,
    ...overrides,
  }
}

describe('la prosa vigente', () => {
  it('sin mensaje propio, el predeterminado de la aplicacion', () => {
    expect(activeReminderBody(reminder())).toBe(DEFAULT_REMINDER_MESSAGE)
  })

  it('con el interruptor encendido, el suyo', () => {
    const body = activeReminderBody(
      reminder({ useCustomMessage: true, customMessage: 'Buenas, no olviden su abono.' }),
    )
    expect(body).toBe('Buenas, no olviden su abono.')
  })

  it('el interruptor manda sobre el texto guardado, no al reves (BR-S06)', () => {
    // Apagarlo NO borra lo escrito: volver a encenderlo lo devuelve.
    const body = activeReminderBody(
      reminder({ useCustomMessage: false, customMessage: 'Lo mio, guardado.' }),
    )
    expect(body).toBe(DEFAULT_REMINDER_MESSAGE)
  })

  it('con «uso mi mensaje» y el texto vacio, se cae al predeterminado', () => {
    // Cinturon: el CHECK lo impide, pero un dato escrito a mano no mandaria un
    // mensaje vacio.
    const body = activeReminderBody(reminder({ useCustomMessage: true, customMessage: '   ' }))
    expect(body).toBe(DEFAULT_REMINDER_MESSAGE)
  })

  it('el predeterminado NO nombra clientes, saldos ni importes (BR-S09)', () => {
    expect(DEFAULT_REMINDER_MESSAGE).not.toMatch(/\$|saldo|deuda|debe[sn]?\b/i)
  })
})

describe('el bloque de cuentas', () => {
  it('le habla al CLIENTE, que es quien lo va a leer', () => {
    expect(accountsBlock([account()])).toContain('Puedes pagar aquí:')
    expect(accountsBlock([account()])).not.toContain('Tus cuentas')
  })

  it('lista las activas en su orden', () => {
    const block = accountsBlock([
      account({ id: 'b', sortOrder: 2, kind: 'daviplata', phone: '301 000 0000' }),
      account({ id: 'a', sortOrder: 1 }),
    ])
    const lines = block.split('\n')
    expect(lines[1]).toContain('Nequi')
    expect(lines[2]).toContain('Daviplata')
  })

  it('una cuenta archivada no entra', () => {
    const block = accountsBlock([account({ archivedAt: '2026-09-01T00:00:00Z', sortOrder: null })])
    expect(block).toBe('')
  })

  it('sin cuentas NO inventa un encabezado vacio', () => {
    expect(accountsBlock([])).toBe('')
  })
})

describe('el mensaje completo (BR-S07)', () => {
  it('es la prosa y, al final, las cuentas', () => {
    const message = buildReminderMessage(reminder(), [account()])
    expect(message.startsWith(DEFAULT_REMINDER_MESSAGE)).toBe(true)
    expect(message).toContain('Puedes pagar aquí:')
    expect(message).toContain('• Nequi · 300 123 4567 · Ana Torres')
  })

  it('NO existe ningun marcador que se pueda romper', () => {
    // La decision entera de BR-S07: las cuentas se añaden solas, asi que no hay
    // nada que conservar y por tanto nada que borrar, duplicar ni partir.
    const message = buildReminderMessage(
      reminder({ useCustomMessage: true, customMessage: 'Mi texto.' }),
      [account()],
    )
    expect(message).not.toContain('{{')
    expect(message).not.toContain('}}')
  })

  it('sin cuentas devuelve solo la prosa, sin un hueco al final', () => {
    const message = buildReminderMessage(reminder(), [])
    expect(message).toBe(DEFAULT_REMINDER_MESSAGE)
  })

  it('cambiar una cuenta cambia el mensaje sin tocar el recordatorio (BR-S08)', () => {
    const fijo = reminder()
    const antes = buildReminderMessage(fijo, [account()])
    const despues = buildReminderMessage(fijo, [account({ holderName: 'Ana María Torres' })])

    expect(antes).not.toBe(despues)
    expect(despues).toContain('Ana María Torres')
  })
})

describe('cuando suena, dicho en voz alta', () => {
  it('dia y hora, con la hora de reloj en 12 horas', () => {
    expect(reminderSchedule(reminder())).toBe('Martes a las 7:00 p. m.')
  })

  it('la manana se dice a. m.', () => {
    expect(reminderSchedule(reminder({ weekday: 5, timeOfDay: '06:45:00' }))).toBe(
      'Viernes a las 6:45 a. m.',
    )
  })

  it('formatClockEs no desplaza la hora a ninguna zona', () => {
    // Es una hora de RELOJ, no un instante: 19:00 son las 7 p. m. y punto.
    expect(formatClockEs('19:00:00')).toBe('7:00 p. m.')
    expect(formatClockEs('00:00')).toBe('12:00 a. m.')
    expect(formatClockEs('12:00')).toBe('12:00 p. m.')
  })

  it('la lista se lee por dia y hora', () => {
    const ordenados = sortReminders([
      reminder({ id: 'tarde', weekday: 2, timeOfDay: '20:00:00' }),
      reminder({ id: 'lunes', weekday: 1, timeOfDay: '08:00:00' }),
      reminder({ id: 'manana', weekday: 2, timeOfDay: '08:00:00' }),
    ])
    expect(ordenados.map((r) => r.id)).toEqual(['lunes', 'manana', 'tarde'])
  })

  it('solo los activos cuentan para el tope', () => {
    const lista = [
      reminder({ id: '1' }),
      reminder({ id: '2', status: 'paused' }),
      reminder({ id: '3', status: 'archived' }),
    ]
    expect(countActive(lista)).toBe(1)
    expect(PAYMENT_REMINDER_MAX).toBe(14)
  })
})

describe('validacion del formulario', () => {
  const base = { weekday: 2, timeOfDay: '19:00', useCustomMessage: false, customMessage: '' }

  it('acepta una hora de `<input type="time">`', () => {
    expect(paymentReminderSchema.safeParse(base).success).toBe(true)
  })

  it('acepta la hora con segundos que devuelve PostgreSQL', () => {
    expect(paymentReminderSchema.safeParse({ ...base, timeOfDay: '19:00:00' }).success).toBe(true)
  })

  it('rechaza un dia fuera de 1..7', () => {
    expect(paymentReminderSchema.safeParse({ ...base, weekday: 0 }).success).toBe(false)
    expect(paymentReminderSchema.safeParse({ ...base, weekday: 8 }).success).toBe(false)
  })

  it('rechaza «uso mi mensaje» sin mensaje', () => {
    const result = paymentReminderSchema.safeParse({
      ...base,
      useCustomMessage: true,
      customMessage: '   ',
    })
    expect(result.success).toBe(false)
  })

  it('los segundos se descartan: la precision es de minuto (BR-S02)', () => {
    expect(toMinutePrecision('19:00')).toBe('19:00:00')
    expect(toMinutePrecision('19:00:45')).toBe('19:00:00')
  })
})

describe('lo que hay por enviar (BR-S08, BR-S10, D-189)', () => {
  it('la mas antigua primero: es el orden en que se mandan', () => {
    const ordenadas = sortOccurrences([
      { id: 'nueva', scheduledFor: '2026-09-12T00:00:00.000Z', reminder: reminder() },
      { id: 'vieja', scheduledFor: '2026-09-05T00:00:00.000Z', reminder: reminder() },
      { id: 'media', scheduledFor: '2026-09-09T00:00:00.000Z', reminder: reminder() },
    ])
    expect(ordenadas.map((o) => o.id)).toEqual(['vieja', 'media', 'nueva'])
  })

  it('el mensaje se compone al abrirlo: cambiar una cuenta cambia lo que se copia', () => {
    // BR-S08 dicho como codigo. La ocurrencia guarda CUANDO le tocaba, nunca el
    // texto: corregir el numero de una cuenta arregla el mensaje que esta
    // esperando, sin tocar el recordatorio ni la ocurrencia.
    const ocurrencia = {
      id: 'o1',
      scheduledFor: '2026-09-12T00:00:00.000Z',
      reminder: reminder(),
    }
    const antes = buildReminderMessage(ocurrencia.reminder, [account({ phone: '300 111 1111' })])
    const despues = buildReminderMessage(ocurrencia.reminder, [account({ phone: '300 222 2222' })])
    expect(antes).toContain('300 111 1111')
    expect(despues).toContain('300 222 2222')
    expect(despues).not.toContain('300 111 1111')
  })

  it('los tres textos del flujo describen actos LOCALES (BR-S14)', () => {
    // Ninguno puede presentarse como confirmacion de envio ni de entrega: no
    // hay integracion con WhatsApp y no la va a haber (BR-W08).
    const textos = Object.values(REMINDER_COPY.due)
      .map((t) => (typeof t === 'string' ? t : ''))
      .join(' ')
      .toLowerCase()
    for (const prohibido of ['enviado', 'entregado', 'recibido', 'se envió', 'llegó']) {
      expect(textos, prohibido + ' no puede aparecer').not.toContain(prohibido)
    }
    expect(REMINDER_COPY.due.description).toContain('Rifas no lo envía por ti')
  })

  it('el resumen dice cuantas hay por enviar, con su singular', () => {
    expect(REMINDER_COPY.summary.pending(1)).toBe('1 para enviar')
    expect(REMINDER_COPY.summary.pending(3)).toBe('3 para enviar')
  })
})
