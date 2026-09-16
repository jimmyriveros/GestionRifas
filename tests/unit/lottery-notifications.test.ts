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
    expect(text).toBe(
      'Resultado de Bogotá, sorteo 2840: 0046. Encontramos una boleta asignada que coincide con este resultado. Cliente: Ana Pérez.',
    )
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
    expect(text).toBe(
      'Resultado de Cundinamarca, sorteo 4815: 7700. Tenías una boleta disponible que coincide con este resultado.',
    )
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
    expect(text).toBe(
      'Resultado de Medellín, sorteo 4829: 1234. Coinciden con este resultado 2 boletas asignadas antes del sorteo y 1 boleta disponible, en 2 rifas.',
    )
    expect(text.toLowerCase()).not.toMatch(/ganador/)
  })
})

describe('una coincidencia se dice con el RESULTADO, no con «este número» (I-126, D-203)', () => {
  const resultado = { lottery_code: 'cundinamarca', draw_number: '4818', winning_number: '4818' }

  it('varias vendidas: concuerda el plural y el cliente es de UNA de ellas', () => {
    expect(
      notificationMessage('lottery.result', {
        ...resultado,
        audience: 'seller',
        sold_count: 2,
        available_count: 0,
        client_name: 'Ana Torres',
      }),
    ).toBe(
      'Resultado de Cundinamarca, sorteo 4818: 4818. Encontramos 2 boletas asignadas que coinciden con este resultado. Una de ellas es de Ana Torres.',
    )
  })

  it('vendidas y disponibles juntas, en singular y en plural', () => {
    expect(
      notificationMessage('lottery.result', {
        ...resultado,
        audience: 'seller',
        sold_count: 1,
        available_count: 1,
        client_name: 'Ana Torres',
      }),
    ).toBe(
      'Resultado de Cundinamarca, sorteo 4818: 4818. Encontramos una boleta asignada que coincide con este resultado y tenías otra disponible. Cliente: Ana Torres.',
    )
    expect(
      notificationMessage('lottery.result', {
        ...resultado,
        audience: 'seller',
        sold_count: 1,
        available_count: 3,
      }),
    ).toBe(
      'Resultado de Cundinamarca, sorteo 4818: 4818. Encontramos una boleta asignada que coincide con este resultado y tenías otras 3 disponibles.',
    )
    expect(
      notificationMessage('lottery.result', {
        ...resultado,
        audience: 'seller',
        sold_count: 2,
        available_count: 1,
      }),
    ).toBe(
      'Resultado de Cundinamarca, sorteo 4818: 4818. Encontramos 2 boletas asignadas que coinciden con este resultado y tenías otra disponible.',
    )
  })

  it('varias disponibles, sin vendidas', () => {
    expect(
      notificationMessage('lottery.result', {
        ...resultado,
        audience: 'seller',
        sold_count: 0,
        available_count: 3,
      }),
    ).toBe(
      'Resultado de Cundinamarca, sorteo 4818: 4818. Tenías 3 boletas disponibles que coinciden con este resultado.',
    )
  })

  it('el personal concuerda el verbo con UNA sola boleta y no escribe «0 boletas»', () => {
    const text = notificationMessage('lottery.result', {
      ...resultado,
      audience: 'staff',
      sold_count: 1,
      available_count: 0,
      raffle_count: 1,
      raffle_names: ['Rifa A'],
    })
    expect(text).toBe(
      'Resultado de Cundinamarca, sorteo 4818: 4818. Coincide con este resultado 1 boleta asignada antes del sorteo, en Rifa A.',
    )
    expect(text).not.toContain('0 boletas')
  })

  it('ningún aviso de resultado dice «con este número», «ganador», «ganadora» ni «premiada»', () => {
    const casos = [
      { audience: 'seller', sold_count: 1, available_count: 0, client_name: 'Ana' },
      { audience: 'seller', sold_count: 0, available_count: 1 },
      { audience: 'seller', sold_count: 2, available_count: 2, client_name: 'Ana' },
      { audience: 'staff', sold_count: 1, available_count: 1, raffle_names: ['Rifa A'] },
      { audience: 'staff', sold_count: 0, available_count: 0 },
    ]
    for (const caso of casos) {
      const text = notificationMessage('lottery.result', { ...resultado, ...caso }).toLowerCase()
      expect(text, JSON.stringify(caso)).not.toMatch(
        /con este número|ganador|ganadora|premiad|cuatro cifras|número exacto/,
      )
    }
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
