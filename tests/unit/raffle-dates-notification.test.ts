import { describe, expect, it } from 'vitest'

import { notificationHref, notificationMessage } from '@/features/notifications/text'
import {
  RAFFLE_DATE_CHANGE_NOTICE,
  raffleDateChangeAnnounced,
} from '@/features/raffles/date-change'

/**
 * El texto del aviso de las fechas de una rifa activa (BR-R12, D-206).
 *
 * A quién llega, cuándo y con qué datos lo prueba
 * `tests/db/raffle-date-notices.test.ts`. Aquí, lo que se LEE en la campana:
 * la rifa y la fecha nueva, una idea por aviso, y nada de la cartera.
 */

const KIND = 'raffle.dates_changed'

/** La rifa real antes de extenderla: del 27 de julio al 1 de noviembre de 2026. */
const antes = {
  raffle_id: '11111111-2222-4333-8444-555555555555',
  raffle_name: 'SORTEO CAMIONETA KIA 2027',
  previous_start_date: '2026-07-27',
  previous_end_date: '2026-11-01',
  start_date: '2026-07-27',
  end_date: '2026-11-01',
}

describe('el aviso de las fechas de una rifa activa (BR-R12, D-206)', () => {
  it('F1: si cambia el fin, dice hasta cuándo va la rifa', () => {
    expect(notificationMessage(KIND, { ...antes, end_date: '2026-12-21' })).toBe(
      'Cambiaron las fechas de SORTEO CAMIONETA KIA 2027: ahora termina el 21 de diciembre de 2026.',
    )
  })

  it('F2: si cambia el inicio, dice desde cuándo', () => {
    expect(notificationMessage(KIND, { ...antes, start_date: '2026-08-03' })).toBe(
      'Cambiaron las fechas de SORTEO CAMIONETA KIA 2027: ahora empieza el 3 de agosto de 2026.',
    )
  })

  it('F3: si cambian las dos, dice el período entero sin repetir el mes ni el año', () => {
    expect(
      notificationMessage(KIND, { ...antes, start_date: '2026-08-03', end_date: '2026-12-21' }),
    ).toBe(
      'Cambiaron las fechas de SORTEO CAMIONETA KIA 2027: ahora va del 3 de agosto al 21 de diciembre de 2026.',
    )
    expect(
      notificationMessage(KIND, { ...antes, start_date: '2026-12-01', end_date: '2027-01-15' }),
    ).toBe(
      'Cambiaron las fechas de SORTEO CAMIONETA KIA 2027: ahora va del 1 de diciembre de 2026 al 15 de enero de 2027.',
    )
    expect(
      notificationMessage(KIND, { ...antes, start_date: '2026-12-21', end_date: '2026-12-21' }),
    ).toBe(
      'Cambiaron las fechas de SORTEO CAMIONETA KIA 2027: ahora es solo el 21 de diciembre de 2026.',
    )
  })

  it('F4: con datos incompletos o raros no inventa ninguna fecha', () => {
    expect(notificationMessage(KIND, { raffle_name: 'Rifa Navidad 2026' })).toBe(
      'Cambiaron las fechas de Rifa Navidad 2026.',
    )
    expect(notificationMessage(KIND, {})).toBe('Cambiaron las fechas de la rifa.')
    expect(notificationMessage(KIND, { ...antes, end_date: '21/12/2026' })).toBe(
      'Cambiaron las fechas de SORTEO CAMIONETA KIA 2027.',
    )
    // Sin fecha anterior no se sabe qué cambió; si la nueva es válida, se dice.
    expect(notificationMessage(KIND, { raffle_name: 'Rifa', end_date: '2026-12-21' })).toBe(
      'Cambiaron las fechas de Rifa: ahora termina el 21 de diciembre de 2026.',
    )
  })

  it('F5: no lleva clientes, ventas, pagos ni cartera, no dice «ganador» y no enlaza a ninguna pantalla', () => {
    const mensaje = notificationMessage(KIND, {
      ...antes,
      end_date: '2026-12-21',
      client_name: 'Ana Torres',
      sale_price: 120000,
      paid_amount: 50000,
      pending_amount: 70000,
    })
    expect(mensaje).not.toContain('Ana Torres')
    expect(mensaje).not.toContain('120')
    expect(mensaje).not.toContain('50.000')
    expect(mensaje).not.toContain('$')
    expect(mensaje.toLowerCase()).not.toContain('ganador')
    expect(notificationHref(KIND)).toBeNull()
  })
})

describe('lo que dice la pantalla de editar ANTES de guardar (BR-R12, D-206)', () => {
  const guardadas = { startDate: '2026-07-27', endDate: '2026-11-01' }

  it('F6: solo con la rifa activa y alguna fecha distinta de la guardada', () => {
    expect(
      raffleDateChangeAnnounced({
        status: 'active',
        saved: guardadas,
        current: { ...guardadas, endDate: '2026-12-21' },
      }),
    ).toBe(true)
    expect(
      raffleDateChangeAnnounced({
        status: 'active',
        saved: guardadas,
        current: { ...guardadas, startDate: '2026-08-03' },
      }),
    ).toBe(true)
    // Las mismas fechas no avisan, y la base tampoco escribe nada.
    expect(
      raffleDateChangeAnnounced({ status: 'active', saved: guardadas, current: guardadas }),
    ).toBe(false)
    // Un borrador no avisa al cambiar sus fechas.
    for (const status of ['draft', 'closed', 'cancelled'] as const) {
      expect(
        raffleDateChangeAnnounced({
          status,
          saved: guardadas,
          current: { ...guardadas, endDate: '2026-12-21' },
        }),
      ).toBe(false)
    }
  })

  it('F7: la frase dice qué va a pasar, a quién, y no habla el idioma del código', () => {
    expect(RAFFLE_DATE_CHANGE_NOTICE).toBe(
      'Al guardar, las demás personas de tu organización recibirán un aviso con las fechas nuevas.',
    )
    expect(RAFFLE_DATE_CHANGE_NOTICE).not.toMatch(/notific|trigger|membres|start_date|end_date/i)
  })
})
