import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ACCOUNT_COPY,
  accountLine,
  accountParts,
  accountShape,
  activeAccounts,
  archivedAccounts,
  IDENTIFIER_FORBIDDEN_RANGES,
  identifierProblem,
  isBankAccount,
  isIdentifierKind,
  PAYMENT_ACCOUNT_IDENTIFIER_MAX,
  PAYMENT_ACCOUNT_KINDS,
  PAYMENT_ACCOUNT_MAX,
  type PaymentAccount,
} from '@/features/payment-accounts/accounts'
import { paymentAccountSchema } from '@/features/payment-accounts/schemas'
import { PAYMENT_ACCOUNT_KIND_LABELS } from '@/lib/constants'

/**
 * Las cuentas para recibir pagos: como se dicen y que combinaciones no valen
 * (BR-M04, BR-M05, BR-M10, D-188, D-209).
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
    identifier: null,
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
    identifier: null,
    label: null,
    sortOrder: 2,
    archivedAt: null,
    ...overrides,
  }
}

function breb(overrides: Partial<PaymentAccount> = {}): PaymentAccount {
  return {
    id: 'k1',
    kind: 'breb',
    holderName: 'Ana Torres',
    phone: null,
    bankName: null,
    accountType: null,
    accountNumber: null,
    identifier: '@maria',
    label: null,
    sortOrder: 3,
    archivedAt: null,
    ...overrides,
  }
}

/**
 * Un caracter por su punto de codigo. Los invisibles se construyen asi, y no
 * escritos dentro de una cadena, para que este archivo no tenga ninguno.
 */
const cp = (codePoint: number) => String.fromCodePoint(codePoint)

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

  it('Nequi, Daviplata y banco NO miran el identificador: siguen con sus reglas', () => {
    // Un identificador olvidado en el formulario —se escribio y despues se
    // cambio de forma— no hace fallar a un Nequi; y un telefono con letras sigue
    // sin valer aunque ahora exista un campo que si las acepta.
    expect(
      paymentAccountSchema.safeParse({
        ...base,
        kind: 'nequi',
        phone: '3001234567',
        identifier: cp(0x0a),
      }).success,
    ).toBe(true)
    expect(
      paymentAccountSchema.safeParse({ ...base, kind: 'nequi', phone: '@maria' }).success,
    ).toBe(false)
  })
})

// =============================================================================
describe('Bre-B y «Otros»: las cinco formas (BR-M03, BR-M04, D-209)', () => {
  it('se ofrecen en este orden, con los nombres que pidio el dueño', () => {
    expect(PAYMENT_ACCOUNT_KINDS).toEqual(['nequi', 'daviplata', 'bank', 'breb', 'other'])
    expect(PAYMENT_ACCOUNT_KINDS.map((kind) => PAYMENT_ACCOUNT_KIND_LABELS[kind])).toEqual([
      'Nequi',
      'Daviplata',
      'Cuenta bancaria',
      'Bre-B',
      'Otros',
    ])
  })

  it('cada forma pide lo suyo: telefono, banco o un texto libre', () => {
    expect(PAYMENT_ACCOUNT_KINDS.map(accountShape)).toEqual([
      'phone',
      'phone',
      'bank',
      'identifier',
      'identifier',
    ])
    expect(isBankAccount('breb')).toBe(false)
    expect(isIdentifierKind('breb')).toBe(true)
    expect(isIdentifierKind('other')).toBe(true)
    expect(isIdentifierKind('nequi')).toBe(false)
  })

  it('las etiquetas de los dos campos nuevos son las pedidas', () => {
    expect(ACCOUNT_COPY.form.identifier.breb.label).toBe('Tu llave')
    expect(ACCOUNT_COPY.form.identifier.other.label).toBe('Número o identificador')
  })

  it('una Bre-B y una «Otros» se escriben donde · llave · titular, tal cual', () => {
    expect(accountLine(breb())).toBe('Bre-B · @maria · Ana Torres')
    expect(accountLine(breb({ kind: 'other', identifier: '0012-AbC/#' }))).toBe(
      'Otros · 0012-AbC/# · Ana Torres',
    )
    expect(accountParts(breb())).toHaveLength(3)
  })

  it('la llave no gana un «@», no pierde mayusculas y no pierde ceros', () => {
    expect(accountLine(breb({ identifier: 'MariaG' }))).toBe('Bre-B · MariaG · Ana Torres')
    expect(accountLine(breb({ identifier: '000123' }))).toContain('· 000123 ·')
  })

  it('el nombre para reconocerla NO entra, tampoco aqui', () => {
    expect(accountLine(breb({ label: 'La del negocio' }))).not.toContain('negocio')
  })
})

// =============================================================================
describe('la llave y el identificador (BR-M10)', () => {
  const base = {
    holderName: 'Ana Torres',
    phone: '',
    bankName: '',
    accountType: null,
    accountNumber: '',
    label: '',
  }

  /** Lo que el esquema deja pasar y cómo lo deja, o la frase con la que lo para. */
  function parse(kind: 'breb' | 'other', identifier: string) {
    const result = paymentAccountSchema.safeParse({ ...base, kind, identifier })
    return result.success
      ? { ok: true as const, value: result.data.identifier }
      : { ok: false as const, message: result.error.issues[0]?.message }
  }

  it('acepta letras, numeros y simbolos, y los conserva tal cual', () => {
    for (const valor of [
      '@maria',
      'maria',
      '@Maria_07.x',
      '0012345',
      'ana.torres@correo.com',
      '300 123 4567',
      'Cuenta Ñandú #12 (principal)',
      '+57-300/123*4567',
    ]) {
      expect(parse('breb', valor), valor).toEqual({ ok: true, value: valor })
      expect(parse('other', valor), valor).toEqual({ ok: true, value: valor })
    }
  })

  it('quita SOLO los espacios exteriores, los mismos que String.prototype.trim()', () => {
    const exterior = ` ${cp(0x09)}${cp(0xa0)}${cp(0x3000)}`
    expect(parse('breb', `${exterior}@maria${exterior}`)).toEqual({ ok: true, value: '@maria' })
    // Los de dentro se quedan: «Otros» puede llevar espacios.
    expect(parse('other', '  Movii 300 123 4567  ')).toEqual({
      ok: true,
      value: 'Movii 300 123 4567',
    })
  })

  it('vacio o solo espacios, lo dice por su nombre en cada forma', () => {
    expect(parse('breb', '')).toEqual({ ok: false, message: 'Escribe tu llave.' })
    expect(parse('breb', `  ${cp(0xa0)} `)).toEqual({ ok: false, message: 'Escribe tu llave.' })
    expect(parse('other', ' ')).toEqual({
      ok: false,
      message: 'Escribe el número o identificador.',
    })
  })

  it('100 caracteres caben y 101 no; un emoji cuenta como UNO, igual que en la base', () => {
    expect(PAYMENT_ACCOUNT_IDENTIFIER_MAX).toBe(100)
    expect(parse('breb', 'a'.repeat(100)).ok).toBe(true)
    expect(parse('breb', 'a'.repeat(101))).toEqual({
      ok: false,
      message: 'La llave es demasiado larga. Usa 100 caracteres como máximo.',
    })
    // 99 letras y un emoji: 100 puntos de codigo, 101 unidades de `.length`.
    const conEmoji = 'a'.repeat(99) + cp(0x1f600)
    expect(conEmoji.length).toBe(101)
    expect(parse('other', conEmoji).ok).toBe(true)
    expect(parse('other', 'a'.repeat(101)).ok).toBe(false)
  })

  it('una sola linea y nada invisible: se rechaza en cualquier posicion interior', () => {
    for (const invisible of [
      0x0a, // salto de linea
      0x0d, // retorno de carro
      0x09, // tabulador
      0x00, // nulo
      0x7f, // DEL
      0x85, // siguiente linea (C1)
      0xad, // guion discrecional
      0x200b, // espacio de anchura cero
      0x200d, // union de anchura cero
      0x200f, // marca de derecha a izquierda
      0x2028, // separador de linea
      0x2029, // separador de parrafo
      0x202e, // anulacion de direccion
      0x2060, // union de palabras
      0x2066, // aislamiento de direccion
      0xfeff, // marca de orden de bytes
    ]) {
      const hex = invisible.toString(16)
      expect(parse('breb', `@ma${cp(invisible)}ria`), hex).toEqual({
        ok: false,
        message:
          'La llave tiene saltos de línea o caracteres invisibles. Escríbela de nuevo en una sola línea.',
      })
      expect(parse('other', `12${cp(invisible)}34`).ok, hex).toBe(false)
    }
  })

  it('los espacios visibles de dentro NO se rechazan: el espacio duro se queda', () => {
    expect(parse('other', `Cuenta${cp(0xa0)}12`)).toEqual({
      ok: true,
      value: `Cuenta${cp(0xa0)}12`,
    })
  })

  it('Bre-B no exige telefono, y un telefono escrito antes de cambiar de forma no molesta', () => {
    const result = paymentAccountSchema.safeParse({
      ...base,
      kind: 'breb',
      phone: 'no-es-un-telefono',
      identifier: '@maria',
    })
    expect(result.success).toBe(true)
  })

  it('identifierProblem: la misma frase para el formulario y para la base', () => {
    expect(identifierProblem('breb', '')).toBe(ACCOUNT_COPY.form.identifier.breb.errors.required)
    expect(identifierProblem('other', 'x'.repeat(101))).toBe(
      ACCOUNT_COPY.form.identifier.other.errors.tooLong,
    )
    // Fuera de Bre-B y «Otros» no hay identificador que juzgar.
    expect(identifierProblem('nequi', '')).toBeNull()
    expect(identifierProblem('bank', cp(0x0a))).toBeNull()
  })
})

// =============================================================================
/**
 * La `0074` escribe la MISMA regla en SQL. Estas pruebas leen la migracion y
 * comparan: las seis frases, el tope y la clase de caracteres prohibidos. La de
 * base (`payment-account-identifiers.test.ts`) comprueba ademas el
 * COMPORTAMIENTO, punto de codigo por punto de codigo.
 */
describe('la regla, igual en la migracion (BR-M10)', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/0074_payment_account_identifier.sql'),
    'utf8',
  )

  /** Los rangos de una clase escrita con escapes `\x` de PostgreSQL. */
  function rangesOf(klass: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = []
    for (const m of klass.matchAll(/\\x([0-9a-f]+)(?:-\\x([0-9a-f]+))?/gi)) {
      const from = parseInt(m[1]!, 16)
      ranges.push([from, m[2] ? parseInt(m[2], 16) : from])
    }
    return ranges
  }

  it('las seis frases estan en la migracion, letra por letra', () => {
    for (const kind of ['breb', 'other'] as const) {
      for (const frase of Object.values(ACCOUNT_COPY.form.identifier[kind].errors)) {
        expect(sql, frase).toContain(`'${frase}'`)
      }
    }
  })

  it('el tope es el mismo numero', () => {
    expect(sql).toContain(`char_length(p_value) > ${PAYMENT_ACCOUNT_IDENTIFIER_MAX}`)
  })

  it('la clase prohibida son exactamente los mismos rangos', () => {
    const klass = /p_value ~ '\[([^\]]+)\]'/.exec(sql)?.[1]
    expect(klass).toBeDefined()
    expect(rangesOf(klass!)).toEqual(IDENTIFIER_FORBIDDEN_RANGES.map(([a, b]) => [a, b]))
  })

  it('el recorte de la base quita exactamente lo que quita String.prototype.trim()', () => {
    const klass = /'\^\[([^\]]+)\]\+\|/.exec(sql)?.[1]
    expect(klass).toBeDefined()
    const sqlSet = new Set<number>()
    for (const [a, b] of rangesOf(klass!)) for (let c = a; c <= b; c++) sqlSet.add(c)
    // Los escapes de una letra y el espacio literal de la clase.
    const letras: Record<string, number> = { t: 0x09, n: 0x0a, v: 0x0b, f: 0x0c, r: 0x0d }
    for (const m of klass!.matchAll(/\\([tnvfr])/g)) sqlSet.add(letras[m[1]!]!)
    if (klass!.includes(' ')) sqlSet.add(0x20)

    const jsSet = new Set<number>()
    for (let c = 1; c <= 0xffff; c++) {
      if (c >= 0xd800 && c <= 0xdfff) continue
      if ((cp(c) + 'a' + cp(c)).trim() === 'a') jsSet.add(c)
    }
    expect([...sqlSet].sort((a, b) => a - b)).toEqual([...jsSet].sort((a, b) => a - b))
  })

  it('la migracion no contiene ni un caracter invisible: todo va escapado', () => {
    const invisibles = [...sql].filter((ch) => {
      const c = ch.codePointAt(0)!
      if (c === 0x0a || c === 0x0d) return false
      return IDENTIFIER_FORBIDDEN_RANGES.some(([a, b]) => c >= a && c <= b)
    })
    expect(invisibles).toEqual([])
  })
})
