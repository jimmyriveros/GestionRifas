import { describe, expect, it } from 'vitest'

import {
  accountLine,
  accountParts,
  activeAccounts,
  archivedAccounts,
  isBankAccount,
  PAYMENT_ACCOUNT_MAX,
  type PaymentAccount,
} from '@/features/payment-accounts/accounts'
import { paymentAccountSchema } from '@/features/payment-accounts/schemas'

/**
 * Las cuentas para recibir pagos: como se dicen y que combinaciones no valen
 * (BR-M04, BR-M05, D-188).
 */

function nequi(overrides: Partial<PaymentAccount> = {}): PaymentAccount {
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

function bank(overrides: Partial<PaymentAccount> = {}): PaymentAccount {
  return {
    id: 'b1',
    kind: 'bank',
    holderName: 'Ana Torres',
    phone: null,
    bankName: 'Bancolombia',
    accountType: 'savings',
    accountNumber: '123-456-789',
    label: null,
    sortOrder: 2,
    archivedAt: null,
    ...overrides,
  }
}

describe('como se escribe una cuenta', () => {
  it('un Nequi: donde, numero y titular, en ese orden', () => {
    // Es el orden en que se dicta por telefono (UX_COPY_GUIDELINES, Anexo A).
    expect(accountLine(nequi())).toBe('Nequi · 300 123 4567 · Ana Torres')
  })

  it('un Daviplata se nombra por su nombre propio', () => {
    expect(accountLine(nequi({ kind: 'daviplata' }))).toBe(
      'Daviplata · 300 123 4567 · Ana Torres',
    )
  })

  it('una cuenta bancaria: banco, tipo, numero y titular', () => {
    expect(accountLine(bank())).toBe('Bancolombia · Ahorros · 123-456-789 · Ana Torres')
    expect(accountLine(bank({ accountType: 'checking' }))).toContain('Corriente')
  })

  it('el nombre para reconocerla NO entra: es del vendedor', () => {
    const line = accountLine(nequi({ label: 'El Nequi de mi esposa' }))
    expect(line).not.toContain('esposa')
  })

  it('devuelve las partes sueltas, para que la pantalla pueda separarlas', () => {
    expect(accountParts(bank())).toHaveLength(4)
    expect(accountParts(nequi())).toHaveLength(3)
  })

  it('isBankAccount distingue la unica forma con banco', () => {
    expect(isBankAccount('bank')).toBe(true)
    expect(isBankAccount('nequi')).toBe(false)
    expect(isBankAccount('daviplata')).toBe(false)
  })
})

describe('activas y archivadas', () => {
  const cuentas = [
    nequi({ id: 'tercera', sortOrder: 3 }),
    bank({ id: 'primera', sortOrder: 1 }),
    nequi({ id: 'archivada', sortOrder: null, archivedAt: '2026-09-01T00:00:00Z' }),
    nequi({ id: 'segunda', sortOrder: 2 }),
  ]

  it('las activas salen en su orden, que es el del mensaje', () => {
    expect(activeAccounts(cuentas).map((c) => c.id)).toEqual(['primera', 'segunda', 'tercera'])
  })

  it('una archivada no cuenta como activa', () => {
    expect(activeAccounts(cuentas)).toHaveLength(3)
    expect(archivedAccounts(cuentas).map((c) => c.id)).toEqual(['archivada'])
  })

  it('el tope de cinco esta dicho una sola vez', () => {
    expect(PAYMENT_ACCOUNT_MAX).toBe(5)
  })
})

describe('que combinaciones de datos no valen (BR-M04)', () => {
  const base = {
    holderName: 'Ana Torres',
    phone: '',
    bankName: '',
    accountType: null,
    accountNumber: '',
    label: '',
  }

  it('un Nequi necesita telefono', () => {
    expect(paymentAccountSchema.safeParse({ ...base, kind: 'nequi' }).success).toBe(false)
    expect(
      paymentAccountSchema.safeParse({ ...base, kind: 'nequi', phone: '3001234567' }).success,
    ).toBe(true)
  })

  it('una cuenta bancaria necesita banco, tipo y numero', () => {
    expect(paymentAccountSchema.safeParse({ ...base, kind: 'bank' }).success).toBe(false)
    expect(
      paymentAccountSchema.safeParse({
        ...base,
        kind: 'bank',
        bankName: 'Bancolombia',
        accountType: 'savings',
        accountNumber: '123456',
      }).success,
    ).toBe(true)
  })

  it('sin titular no vale, venga como venga', () => {
    expect(
      paymentAccountSchema.safeParse({
        ...base,
        kind: 'nequi',
        phone: '3001234567',
        holderName: ' ',
      }).success,
    ).toBe(false)
  })

  it('un numero de cuenta con letras se rechaza', () => {
    const result = paymentAccountSchema.safeParse({
      ...base,
      kind: 'bank',
      bankName: 'Bancolombia',
      accountType: 'savings',
      accountNumber: 'AB-123',
    })
    expect(result.success).toBe(false)
  })

  it('el telefono acepta los separadores que escribe PhoneInput (D-184)', () => {
    expect(
      paymentAccountSchema.safeParse({ ...base, kind: 'daviplata', phone: '300 123 4567' }).success,
    ).toBe(true)
  })
})
