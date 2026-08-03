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
      'No tienes permiso para realizar esta accion.',
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
})
