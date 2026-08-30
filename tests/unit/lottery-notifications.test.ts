import { describe, expect, it } from 'vitest'

import { notificationMessage } from '@/features/notifications/text'

describe('avisos de resultado (BR-L15, BR-L19)', () => {
  it('el vendedor con boleta asignada no es llamado ganador', () => {
    const text = notificationMessage('lottery.result', {
      audience: 'seller',
      lottery_code: 'bogota',
      draw_number: '2840',
      winning_number: '0046',
      sold_count: 1,
      available_count: 0,
      client_name: 'Ana Pérez',
    })
    expect(text).toContain('Encontramos una boleta asignada con este número')
    expect(text).toContain('0046')
    expect(text).toContain('Ana Pérez')
    expect(text.toLowerCase()).not.toMatch(/ganador/)
  })

  it('el vendedor con boleta disponible recibe el aviso de no vendida', () => {
    const text = notificationMessage('lottery.result', {
      audience: 'seller',
      lottery_code: 'cundinamarca',
      draw_number: '4815',
      winning_number: '7700',
      sold_count: 0,
      available_count: 1,
    })
    expect(text).toContain('Tenías una boleta disponible con este número')
    expect(text).toContain('Cundinamarca')
    expect(text.toLowerCase()).not.toMatch(/ganador/)
  })

  it('el personal recibe el recuento agregado por rifas', () => {
    const text = notificationMessage('lottery.result', {
      audience: 'staff',
      lottery_code: 'medellin',
      draw_number: '4829',
      winning_number: '1234',
      sold_count: 2,
      available_count: 1,
      raffle_count: 2,
      raffle_names: ['Rifa A', 'Rifa B'],
    })
    expect(text).toContain('2 boletas asignadas antes del sorteo')
    expect(text).toContain('1 boleta disponible')
    expect(text).toContain('en 2 rifas')
    expect(text.toLowerCase()).not.toMatch(/ganador/)
  })
})

describe('avisos de programacion (D-146)', () => {
  it('un aplazamiento nombra los dias, no dice hoy', () => {
    const text = notificationMessage('lottery.schedule_change', {
      lottery_code: 'cundinamarca',
      schedule_status: 'rescheduled_later',
      reference_date: '2026-08-10',
      official_date: '2026-08-11',
    })
    expect(text).toBe(
      'El sorteo de Cundinamarca correspondiente al lunes se jugará el martes, según la programación oficial.',
    )
    expect(text.toLowerCase()).not.toContain('hoy')
  })

  it('un adelanto usa la formula del encargo', () => {
    const text = notificationMessage('lottery.schedule_change', {
      lottery_code: 'bogota',
      schedule_status: 'rescheduled_earlier',
      reference_date: '2026-04-02',
      official_date: '2026-03-31',
    })
    expect(text).toBe(
      'El sorteo de Bogotá correspondiente al jueves se jugará anticipadamente el martes.',
    )
  })

  it('festivo sin traslado no usa hoy, usa el dia de referencia', () => {
    const text = notificationMessage('lottery.schedule_change', {
      lottery_code: 'boyaca',
      schedule_status: 'scheduled',
      change_reason: 'holiday',
      reference_date: '2026-04-04',
      official_date: '2026-04-04',
    })
    expect(text).toContain('se juega el sábado, aunque es festivo')
    expect(text.toLowerCase()).not.toContain('hoy')
  })

  it('suspendido, cancelado, sin verificar y conflicto usan las frases del encargo', () => {
    expect(
      notificationMessage('lottery.schedule_change', {
        lottery_code: 'meta',
        schedule_status: 'suspended',
      }),
    ).toContain('está suspendido')
    expect(
      notificationMessage('lottery.schedule_change', {
        lottery_code: 'meta',
        schedule_status: 'cancelled',
      }),
    ).toContain('No habrá sorteo')
    expect(
      notificationMessage('lottery.schedule_change', {
        schedule_status: 'schedule_unverified',
      }),
    ).toBe('Horario por confirmar.')
    expect(
      notificationMessage('lottery.schedule_change', {
        schedule_status: 'schedule_conflict',
      }),
    ).toBe('La programación oficial requiere verificación.')
  })
})
