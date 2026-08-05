import { describe, expect, it } from 'vitest'

import { clientFormSchema, toClientRow, updateClientSchema } from '@/features/clients/schemas'
import { createSellerTicketsSchema } from '@/features/tickets/seller/schemas'
import { validateBulkRows, hasErrors, countErrors } from '@/features/tickets/bulk/duplicates'
import { SELLER_TICKET_MAX } from '@/lib/constants'

const UUID = '11111111-2222-4333-8444-555555555555'

const validClient = {
  name: 'Ana Torres',
  alias: '',
  phone: '3001234567',
  email: '',
  notes: '',
}

describe('clientFormSchema (BR-C02)', () => {
  it('acepta el minimo: nombre y telefono', () => {
    expect(clientFormSchema.safeParse(validClient).success).toBe(true)
  })

  it('exige nombre de al menos 2 caracteres', () => {
    expect(clientFormSchema.safeParse({ ...validClient, name: 'A' }).success).toBe(false)
    expect(clientFormSchema.safeParse({ ...validClient, name: '' }).success).toBe(false)
  })

  it('exige telefono con formato valido', () => {
    expect(clientFormSchema.safeParse({ ...validClient, phone: '' }).success).toBe(false)
    expect(clientFormSchema.safeParse({ ...validClient, phone: '123' }).success).toBe(false)
    expect(clientFormSchema.safeParse({ ...validClient, phone: 'no-es-telefono' }).success).toBe(
      false,
    )
    expect(
      clientFormSchema.safeParse({ ...validClient, phone: '+57 (300) 123-4567' }).success,
    ).toBe(true)
  })

  it('el correo es opcional pero, si viene, debe ser valido', () => {
    expect(clientFormSchema.safeParse({ ...validClient, email: '' }).success).toBe(true)
    expect(clientFormSchema.safeParse({ ...validClient, email: 'ana@demo.test' }).success).toBe(
      true,
    )
    expect(clientFormSchema.safeParse({ ...validClient, email: 'ana@' }).success).toBe(false)
  })

  it('recorta los espacios sobrantes del nombre', () => {
    const parsed = clientFormSchema.parse({ ...validClient, name: '  Ana Torres  ' })
    expect(parsed.name).toBe('Ana Torres')
  })

  it('updateClientSchema exige un identificador valido', () => {
    expect(updateClientSchema.safeParse({ ...validClient, clientId: UUID }).success).toBe(true)
    expect(updateClientSchema.safeParse({ ...validClient, clientId: 'x' }).success).toBe(false)
  })
})

describe('toClientRow', () => {
  it('convierte los opcionales vacios en NULL, no en cadena vacia', () => {
    const row = toClientRow(validClient)
    expect(row).toEqual({
      name: 'Ana Torres',
      alias: null,
      phone: '3001234567',
      email: null,
      notes: null,
    })
  })

  it('conserva los opcionales cuando vienen con valor', () => {
    const row = toClientRow({
      ...validClient,
      alias: 'La vecina',
      email: 'ana@demo.test',
      notes: 'Paga los viernes',
    })
    expect(row.alias).toBe('La vecina')
    expect(row.email).toBe('ana@demo.test')
    expect(row.notes).toBe('Paga los viernes')
  })

  it('no deja pasar campos que el formulario no controla (sin mass assignment)', () => {
    const row = toClientRow({
      ...validClient,
      // @ts-expect-error: se comprueba justamente que un campo de mas se ignora
      seller_id: 'otro-vendedor',
      organization_id: 'otra-organizacion',
    })
    expect(Object.keys(row).sort()).toEqual(['alias', 'email', 'name', 'notes', 'phone'])
  })
})

describe('validateBulkRows con requireComplete (creacion por el vendedor, BR-N09)', () => {
  it('rechaza una fila vacia: una boleta pendiente no puede quedar sin numeros', () => {
    const result = validateBulkRows([{ dailyNumber: '', weeklyNumber: '' }], {
      requireComplete: true,
    })
    expect(result[0]?.rowError).toBe('Escribe los dos números.')
  })

  it('sin requireComplete, esa misma fila vacia es un borrador valido', () => {
    const result = validateBulkRows([{ dailyNumber: '', weeklyNumber: '' }])
    expect(hasErrors(result)).toBe(false)
  })

  it('rechaza una fila a medias', () => {
    const result = validateBulkRows([{ dailyNumber: '1234', weeklyNumber: '' }], {
      requireComplete: true,
    })
    expect(result[0]?.rowError).toBe('Escribe los dos números.')
  })

  it('sigue detectando duplicados dentro del formulario', () => {
    const result = validateBulkRows(
      [
        { dailyNumber: '0007', weeklyNumber: '0012' },
        { dailyNumber: '0007', weeklyNumber: '0012' },
      ],
      { requireComplete: true },
    )
    expect(countErrors(result)).toBe(1)
    expect(result[1]?.rowError).toBe('Combinación repetida en la fila 1.')
  })

  it('acepta un lote completo y valido', () => {
    const result = validateBulkRows(
      [
        { dailyNumber: '0007', weeklyNumber: '0012' },
        { dailyNumber: '7', weeklyNumber: '12' },
      ],
      { requireComplete: true },
    )
    expect(hasErrors(result)).toBe(false)
  })
})

describe('createSellerTicketsSchema (CLAUDE.md 16, D-049)', () => {
  const row = { dailyNumber: '1234', weeklyNumber: '5678' }

  it('acepta un lote dentro del limite', () => {
    expect(createSellerTicketsSchema.safeParse({ raffleId: UUID, rows: [row] }).success).toBe(true)
  })

  it('rechaza un lote vacio', () => {
    expect(createSellerTicketsSchema.safeParse({ raffleId: UUID, rows: [] }).success).toBe(false)
  })

  it(`rechaza mas de ${SELLER_TICKET_MAX} boletas de una vez`, () => {
    const rows = Array.from({ length: SELLER_TICKET_MAX + 1 }, () => row)
    expect(createSellerTicketsSchema.safeParse({ raffleId: UUID, rows }).success).toBe(false)
  })

  it('exige los dos números en cada fila', () => {
    expect(
      createSellerTicketsSchema.safeParse({
        raffleId: UUID,
        rows: [{ dailyNumber: '1234', weeklyNumber: '' }],
      }).success,
    ).toBe(false)
  })

  it('rechaza numeros de mas de 4 digitos', () => {
    expect(
      createSellerTicketsSchema.safeParse({
        raffleId: UUID,
        rows: [{ dailyNumber: '12345', weeklyNumber: '1' }],
      }).success,
    ).toBe(false)
  })
})
