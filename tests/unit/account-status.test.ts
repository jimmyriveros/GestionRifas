/**
 * El estado de la cuenta de una persona (BR-E14) y el esquema con el que su
 * vendedor padre la corrige (BR-E15).
 *
 * Es la unica logica de este trabajo que no necesita base de datos: decidir
 * que se muestra —«Invitación pendiente», «Cuenta activa» o «Inactivo»— a
 * partir de dos datos que ya viajaban juntos. Lo demas (quien puede corregir a
 * quien, si el correo se puede cambiar) se prueba contra PostgreSQL, porque es
 * ahi donde se decide: tests/db/team-member-lifecycle.test.ts.
 */
import { describe, expect, it } from 'vitest'

import { updateTeamMemberSchema } from '@/features/team/schemas'
import { accountStatus, ACCOUNT_STATUS_LABELS } from '@/lib/constants'

const UUID = '11111111-2222-4333-8444-555555555555'

describe('accountStatus (BR-E14)', () => {
  it('sin activar es una invitación pendiente', () => {
    expect(accountStatus({ isActive: true, activatedAt: null })).toBe('pending')
  })

  it('con fecha de activación la cuenta está activa', () => {
    expect(accountStatus({ isActive: true, activatedAt: '2026-08-14T10:00:00Z' })).toBe('active')
  })

  it('sin acceso manda «Inactivo», aunque la cuenta esté activada', () => {
    // El personal le quito el acceso: eso pesa mas que cualquier otra cosa,
    // porque es lo que responde «¿puede entrar?».
    expect(accountStatus({ isActive: false, activatedAt: '2026-08-14T10:00:00Z' })).toBe('inactive')
  })

  it('sin acceso y sin activar sigue siendo «Inactivo», no las dos cosas', () => {
    expect(accountStatus({ isActive: false, activatedAt: null })).toBe('inactive')
  })

  it('las tres etiquetas son las del glosario', () => {
    expect(ACCOUNT_STATUS_LABELS).toEqual({
      active: 'Cuenta activa',
      pending: 'Invitación pendiente',
      inactive: 'Inactivo',
    })
  })
})

describe('updateTeamMemberSchema (BR-E15)', () => {
  const valid = {
    memberId: UUID,
    fullName: 'Pedro Martínez',
    alias: '',
    phone: '3001234567',
    email: 'pedro@demo.test',
  }

  it('acepta los mismos datos que el alta, más el integrante', () => {
    expect(updateTeamMemberSchema.safeParse(valid).success).toBe(true)
  })

  it('normaliza el correo a minúsculas, igual que el alta', () => {
    // Importa: la base de datos compara el correo nuevo con el actual para
    // decidir si hay que reenviar la invitacion. Sin normalizar, escribir el
    // mismo correo en mayusculas provocaria un envio innecesario.
    const parsed = updateTeamMemberSchema.parse({ ...valid, email: '  Pedro@Demo.TEST ' })
    expect(parsed.email).toBe('pedro@demo.test')
  })

  it('rechaza un integrante que no es un identificador', () => {
    const result = updateTeamMemberSchema.safeParse({ ...valid, memberId: 'el-de-siempre' })
    expect(result.success).toBe(false)
  })

  it('rechaza un correo mal escrito antes de llegar al servidor', () => {
    const result = updateTeamMemberSchema.safeParse({ ...valid, email: 'pedro@' })
    expect(result.success).toBe(false)
  })

  it('exige el teléfono, que es obligatorio en toda la aplicación (BR-U08)', () => {
    const result = updateTeamMemberSchema.safeParse({ ...valid, phone: '' })
    expect(result.success).toBe(false)
  })
})
