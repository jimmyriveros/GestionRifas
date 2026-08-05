import { describe, expect, it } from 'vitest'

import { mapPgError } from '@/lib/errors'

describe('mapPgError', () => {
  it('traduce unique_violation (23505) a espanol', () => {
    expect(mapPgError({ code: '23505', message: 'duplicate key value' })).toBe(
      'Ya existe un registro con estos datos.',
    )
  })

  it('traduce insufficient_privilege (42501), tipico de un bloqueo por RLS', () => {
    expect(mapPgError({ code: '42501', message: 'permission denied' })).toBe(
      'No tienes permiso para realizar esta acción.',
    )
  })

  it('no expone el mensaje interno de Postgres para codigos desconocidos', () => {
    const message = mapPgError({
      code: '99999',
      message: 'internal detail: table public.tickets column sale_price',
    })
    expect(message).not.toContain('tickets')
    expect(message).not.toContain('sale_price')
  })

  it('maneja errores sin forma reconocible sin lanzar', () => {
    expect(() => mapPgError(null)).not.toThrow()
    expect(() => mapPgError(undefined)).not.toThrow()
    expect(() => mapPgError('texto plano')).not.toThrow()
  })

  // Fase 3 (D-044): las RPC y los triggers de la Fase 2 lanzan mensajes de
  // negocio ya redactados en espanol. Propagarlos es mucho mas util que un
  // generico, pero SOLO si los escribimos nosotros.
  describe('mensajes de negocio de las RPC y los triggers', () => {
    it('propaga el mensaje de un raise exception propio (P0001)', () => {
      expect(
        mapPgError({
          code: 'P0001',
          message: 'Solo se pueden asignar boletas disponibles. Estado actual: assigned.',
        }),
      ).toBe('Solo se pueden asignar boletas disponibles. Estado actual: assigned.')
    })

    it('propaga el mensaje de un trigger con errcode check_violation', () => {
      expect(
        mapPgError({
          code: '23514',
          message:
            'No se puede cambiar el cliente de una boleta con pagos activos. Anula los pagos primero.',
        }),
      ).toContain('Anula los pagos primero')
    })

    it('propaga la falta de permiso redactada por una RPC (42501)', () => {
      expect(mapPgError({ code: '42501', message: 'No tienes permiso para anular pagos.' })).toBe(
        'No tienes permiso para anular pagos.',
      )
    })

    it('NO propaga el mensaje que redacta PostgreSQL para un CHECK real', () => {
      const message = mapPgError({
        code: '23514',
        message:
          'new row for relation "tickets" violates check constraint "tickets_assigned_requires_sale"',
      })
      expect(message).not.toContain('tickets')
      expect(message).not.toContain('constraint')
    })
  })

  describe('restricciones con significado de negocio', () => {
    it('traduce la combinacion de numeros repetida (BR-N04)', () => {
      expect(
        mapPgError({
          code: '23505',
          message: 'duplicate key value violates unique constraint "tickets_combo_unique"',
        }),
      ).toBe('Ya existe una boleta con esa combinación de número diario y semanal en esta rifa.')
    })

    it('traduce el nombre de rifa repetido (BR-R11)', () => {
      expect(
        mapPgError({
          code: '23505',
          message: 'duplicate key value violates unique constraint "raffles_org_name_key"',
        }),
      ).toBe('Ya existe una rifa con ese nombre en la organización.')
    })

    it('cae al mensaje generico si la restriccion no esta traducida', () => {
      const message = mapPgError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "alguna_restriccion_interna"',
      })
      expect(message).toBe('Ya existe un registro con estos datos.')
    })
  })
})
