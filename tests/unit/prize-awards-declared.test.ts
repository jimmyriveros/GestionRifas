/**
 * Los dos premios que el dueño confirmó (D-208, respuesta H1).
 *
 * Es una lista corta y no va a crecer sola, pero es la que decide qué se escribe
 * en la base y por cuánto: si alguien cambia un número, una fecha o un importe,
 * estas comprobaciones lo dicen antes de que el cargador toque nada.
 */
import { describe, expect, it } from 'vitest'

import {
  CONFIRMED_AWARDS_BASIS,
  CONFIRMED_PRIZE_AWARDS,
  CONFIRMED_PRIZE_TITLE,
  declaredAwardsKnownAmount,
  declaredAwardsValuePending,
} from '@/features/prize-awards/declared'

describe('los dos premios reconocidos por el negocio', () => {
  it('D1-01: son dos, del Premio diario, y suman $1.000.000', () => {
    expect(CONFIRMED_PRIZE_AWARDS).toHaveLength(2)
    expect(CONFIRMED_PRIZE_AWARDS.every((a) => a.prize_title === CONFIRMED_PRIZE_TITLE)).toBe(true)
    expect(CONFIRMED_PRIZE_AWARDS.every((a) => a.amount === 500_000)).toBe(true)
    expect(declaredAwardsKnownAmount()).toBe(1_000_000)
  })

  it('D1-02: ninguno tiene el valor pendiente: los dos son dinero cierto', () => {
    expect(declaredAwardsValuePending()).toBe(0)
    expect(CONFIRMED_PRIZE_AWARDS.every((a) => a.in_kind_description === undefined)).toBe(true)
  })

  it('D1-03: son los dos casos reales, con sus dos números y su sorteo', () => {
    expect(CONFIRMED_PRIZE_AWARDS[0]).toEqual({
      daily_number: '3427',
      weekly_number: '7702',
      lottery_code: 'bogota',
      reference_date: '2026-09-03',
      prize_title: CONFIRMED_PRIZE_TITLE,
      amount: 500_000,
    })
    expect(CONFIRMED_PRIZE_AWARDS[1]).toEqual({
      daily_number: '9019',
      weekly_number: '3294',
      lottery_code: 'cundinamarca',
      reference_date: '2026-09-14',
      prize_title: CONFIRMED_PRIZE_TITLE,
      amount: 500_000,
    })
  })

  it('D1-04: los números conservan sus cuatro cifras como TEXTO (BR-N03)', () => {
    for (const award of CONFIRMED_PRIZE_AWARDS) {
      expect(award.daily_number).toMatch(/^[0-9]{1,4}$/)
      expect(award.weekly_number).toMatch(/^[0-9]{1,4}$/)
      expect(typeof award.daily_number).toBe('string')
    }
  })

  it('D1-05: el respaldo nombra el ROL que confirmó, no a una persona', () => {
    expect(CONFIRMED_AWARDS_BASIS).toContain('Dueño')
    expect(CONFIRMED_AWARDS_BASIS.length).toBeGreaterThanOrEqual(10)
    expect(CONFIRMED_AWARDS_BASIS.length).toBeLessThanOrEqual(500)
    // Y dice lo que NO significa: las versiones del 17/09 no aplican hacia atrás.
    expect(CONFIRMED_AWARDS_BASIS).toMatch(/no se aplican hacia atrás/i)
  })

  it('D1-06: ningún texto de aquí llama «ganador» a nadie (BR-L15)', () => {
    const textos = [
      CONFIRMED_AWARDS_BASIS,
      CONFIRMED_PRIZE_TITLE,
      ...CONFIRMED_PRIZE_AWARDS.map((a) => a.prize_title),
    ].join(' ')
    expect(textos).not.toMatch(/ganador|ganadora|premiada|premiado/i)
  })
})
