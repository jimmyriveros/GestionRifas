/**
 * La mascara visual del telefono (D-184).
 *
 * Lo que se prueba aqui es PRESENTACION, y por eso la mitad de las pruebas no
 * miran como queda un numero sino lo que la mascara NO puede cambiar: los
 * digitos, lo que la aplicacion acepta, lo que recibe la busqueda y lo que
 * recibe WhatsApp. Un formateador que embellece y por el camino pierde una cifra
 * o cuela un telefono de seis digitos en la base es peor que no tener ninguno.
 */
import { describe, expect, it } from 'vitest'

import { clientFormSchema } from '@/features/clients/schemas'
import { PHONE_REGEX } from '@/lib/constants'
import { applyPhoneEdit, formatPhone, phoneDeletionRange } from '@/lib/phone'
import { digitsOnly, searchNeedle } from '@/lib/search'
import { normalizeWhatsappNumber } from '@/lib/whatsapp'

/**
 * Todas las formas que hay que aguantar: las que la gente teclea, las que
 * admite la columna `phone` desde `0002` y las que puede haber guardadas.
 */
const FORMAS = [
  '',
  '3',
  '30',
  '300',
  '3001',
  '30012',
  '300123',
  '3001234',
  '30012345',
  '300123456',
  '3001234567',
  '30012345678',
  '57',
  '573',
  '5730012345',
  '573001234567',
  '+',
  '+57',
  '+573001234567',
  '+57 (300) 123-4567',
  '+57 300 123 4567',
  '300 123 4567',
  '300-123-4567',
  '(300) 123 4567',
  '300 555-0000',
  '5712345',
  '6012345678',
  '+1 (212) 555-1234',
  '+12125551234',
  '+44 20 7123 4567',
  '2125551234',
  '018000123456',
]

describe('formatPhone — lo que se ve', () => {
  it('un campo vacio se queda vacio', () => {
    expect(formatPhone('')).toBe('')
  })

  it('escribir de a un digito no agrupa hasta que el numero solo puede ser nacional', () => {
    // Hasta el septimo digito el numero todavia puede ser un fijo antiguo
    // completo, que no se agrupa en 3-3-4. Desde el octavo ya no.
    expect(formatPhone('3')).toBe('3')
    expect(formatPhone('300')).toBe('300')
    expect(formatPhone('300123')).toBe('300123')
    expect(formatPhone('3001234')).toBe('3001234')
    expect(formatPhone('30012345')).toBe('300 123 45')
    expect(formatPhone('300123456')).toBe('300 123 456')
    expect(formatPhone('3001234567')).toBe('300 123 4567')
  })

  it('un movil nacional de diez cifras se lee en grupos 3 3 4', () => {
    expect(formatPhone('3001234567')).toBe('300 123 4567')
  })

  it('un fijo nacional de diez cifras tambien: empieza por 6, no por 3', () => {
    expect(formatPhone('6012345678')).toBe('601 234 5678')
  })

  it('con indicativo colombiano se escribe «+57 300 123 4567»', () => {
    expect(formatPhone('573001234567')).toBe('+57 300 123 4567')
    expect(formatPhone('+573001234567')).toBe('+57 300 123 4567')
  })

  it('acepta pegado con espacios, parentesis y guiones', () => {
    expect(formatPhone('+57 (300) 123-4567')).toBe('+57 300 123 4567')
    expect(formatPhone('300-123-4567')).toBe('300 123 4567')
    expect(formatPhone('(300) 123 4567')).toBe('300 123 4567')
    expect(formatPhone('300 555-0000')).toBe('300 555 0000')
    expect(formatPhone('  +57 300 123 4567  ')).toBe('+57 300 123 4567')
  })

  it('descarta lo que la columna no admite, en vez de dejar escribirlo', () => {
    expect(formatPhone('abc300def1234567')).toBe('300 123 4567')
    // Un tabulador pegado desde una hoja de calculo no es el espacio literal
    // que admite el CHECK: se descarta.
    expect(formatPhone('300\t1234567')).toBe('300 123 4567')
  })

  it('no deforma un numero internacional que no sea colombiano', () => {
    expect(formatPhone('+1 (212) 555-1234')).toBe('+1 (212) 555-1234')
    expect(formatPhone('+12125551234')).toBe('+12125551234')
    expect(formatPhone('+44 20 7123 4567')).toBe('+44 20 7123 4567')
    // Diez digitos que NO empiezan por 3 ni por 6 no son un numero nacional
    // colombiano: no se les impone el agrupamiento.
    expect(formatPhone('2125551234')).toBe('2125551234')
    expect(formatPhone('018000123456')).toBe('018000123456')
  })

  it('un fijo antiguo de siete cifras se queda como esta', () => {
    // `5712345` empieza por 57, pero no es un indicativo: el resto no puede ser
    // un numero nacional.
    expect(formatPhone('5712345')).toBe('5712345')
  })

  it('es idempotente: volver a formatear no cambia nada', () => {
    for (const forma of FORMAS) {
      const una = formatPhone(forma)
      expect(formatPhone(una), forma).toBe(una)
    }
  })

  it('no pierde ni un digito', () => {
    for (const forma of FORMAS) {
      expect(digitsOnly(formatPhone(forma)), forma).toBe(digitsOnly(forma))
    }
  })

  it('un «+» escrito nunca se pierde', () => {
    for (const forma of FORMAS) {
      if (!forma.trimStart().startsWith('+')) continue
      expect(formatPhone(forma).startsWith('+'), forma).toBe(true)
    }
  })

  it('«573001234567» gana el «+» que le falta, porque ese 57 es el indicativo', () => {
    // Es lo contrario de perder informacion: el numero es el mismo y se lee
    // mejor. Un 57 que NO es indicativo no lo gana (ver el fijo de siete cifras).
    expect(formatPhone('573001234567')).toBe('+57 300 123 4567')
    expect(formatPhone('5712345')).toBe('5712345')
  })

  it('formatear para mostrar no modifica el valor de origen', () => {
    const guardado = '+57 (300) 123-4567'
    const visto = formatPhone(guardado)
    expect(visto).toBe('+57 300 123 4567')
    expect(guardado).toBe('+57 (300) 123-4567')
  })
})

describe('formatPhone — lo que NO puede cambiar', () => {
  /**
   * `PHONE_REGEX` cuenta CARACTERES permitidos, no digitos (I-108). Anadir un
   * separador cuenta, asi que una mascara descuidada aceptaria telefonos de seis
   * cifras. Esta es la prueba que lo impide.
   */
  it('un valor aceptado sigue aceptado despues de formatearlo', () => {
    for (const forma of FORMAS) {
      if (!PHONE_REGEX.test(forma.trim())) continue
      expect(PHONE_REGEX.test(formatPhone(forma).trim()), forma).toBe(true)
    }
  })

  it('no convierte en valido un telefono demasiado corto', () => {
    for (const corto of ['300123', '30012', '3001', '300', '30', '3', '', '12345', '(300)']) {
      expect(PHONE_REGEX.test(formatPhone(corto).trim()), corto).toBe(false)
    }
  })

  it('lo que produce nunca pasa de 20 caracteres', () => {
    for (const forma of FORMAS) {
      expect(formatPhone(forma).length, forma).toBeLessThanOrEqual(20)
    }
  })

  it('WhatsApp sigue recibiendo el mismo numero canonico', () => {
    for (const forma of ['3001234567', '573001234567', '+57 (300) 123-4567', '300 123 4567']) {
      expect(normalizeWhatsappNumber(formatPhone(forma)), forma).toBe('573001234567')
    }
    // Y un numero de otro pais sale con sus digitos, sin suponer Colombia.
    expect(normalizeWhatsappNumber(formatPhone('+1 (212) 555-1234'))).toBe('12125551234')
  })

  it('la busqueda sigue reduciendo al mismo numero nacional', () => {
    for (const forma of ['3001234567', '573001234567', '+57 (300) 123-4567', '300 123 4567']) {
      expect(searchNeedle(formatPhone(forma)), forma).toBe('3001234567')
    }
  })

  it('un telefono historico valido se puede mostrar sin normalizarlo ni volver a guardarlo', () => {
    // Lo que se ve lleva separadores; lo que el formulario envia es lo guardado,
    // caracter por caracter, porque formatear no toca el valor (D-184).
    const guardado = '+57 (300) 123-4567'
    expect(formatPhone(guardado)).toBe('+57 300 123 4567')

    const enviado = clientFormSchema.parse({
      name: 'Ana Torres',
      alias: '',
      phone: guardado,
      email: '',
      notes: '',
    })
    expect(enviado.phone).toBe(guardado)
  })
})

describe('applyPhoneEdit — donde queda el cursor', () => {
  it('escribiendo al final, el cursor se queda al final', () => {
    expect(applyPhoneEdit('30012345', 8)).toEqual({ value: '300 123 45', caret: 10 })
    expect(applyPhoneEdit('3001234567', 10)).toEqual({ value: '300 123 4567', caret: 12 })
  })

  it('escribiendo en medio, el cursor se queda pegado al digito nuevo', () => {
    // «300 123 4567» con el cursor tras «300»: se teclea un 9.
    const resultado = applyPhoneEdit('3009 123 4567', 4)
    expect(resultado.caret).toBe(4)
    expect(resultado.value.slice(0, 4)).toBe('3009')
  })

  it('pegar un numero con separadores deja el cursor al final', () => {
    const pegado = '+57 (300) 123-4567'
    expect(applyPhoneEdit(pegado, pegado.length)).toEqual({
      value: '+57 300 123 4567',
      caret: 16,
    })
  })

  it('pegar con espacios y guiones cuenta los digitos, no los caracteres', () => {
    const pegado = '300-123 4567'
    expect(applyPhoneEdit(pegado, pegado.length)).toEqual({ value: '300 123 4567', caret: 12 })
  })

  it('un campo vacio deja el cursor en el cero', () => {
    expect(applyPhoneEdit('', 0)).toEqual({ value: '', caret: 0 })
  })

  it('el cursor al principio se queda al principio', () => {
    expect(applyPhoneEdit('3001234567', 0)).toEqual({ value: '300 123 4567', caret: 0 })
  })

  it('aguanta una posicion fuera de rango sin romperse', () => {
    expect(applyPhoneEdit('3001234567', 99).caret).toBe(12)
    expect(applyPhoneEdit('3001234567', -5).caret).toBe(0)
  })
})

describe('phoneDeletionRange — borrar junto a un separador', () => {
  const VISTO = '300 123 4567'

  it('con el cursor detras de un espacio, el borrado se lleva el digito anterior', () => {
    const rango = phoneDeletionRange(VISTO, 4, 4, 'backward')
    expect(rango).toEqual({ start: 2, end: 4 })

    const raw = VISTO.slice(0, rango!.start) + VISTO.slice(rango!.end)
    expect(applyPhoneEdit(raw, rango!.start)).toEqual({ value: '301 234 567', caret: 2 })
  })

  it('con el cursor detras de un digito no interviene: el navegador ya acierta', () => {
    expect(phoneDeletionRange(VISTO, 12, 12, 'backward')).toBeNull()
    expect(phoneDeletionRange(VISTO, 3, 3, 'backward')).toBeNull()
  })

  it('«Suprimir» sobre un espacio se lleva el digito siguiente', () => {
    const rango = phoneDeletionRange(VISTO, 3, 3, 'forward')
    expect(rango).toEqual({ start: 3, end: 5 })

    const raw = VISTO.slice(0, rango!.start) + VISTO.slice(rango!.end)
    expect(applyPhoneEdit(raw, rango!.start)).toEqual({ value: '300 234 567', caret: 3 })
  })

  it('«Suprimir» sobre un digito no interviene', () => {
    expect(phoneDeletionRange(VISTO, 0, 0, 'forward')).toBeNull()
    expect(phoneDeletionRange(VISTO, 4, 4, 'forward')).toBeNull()
  })

  it('no interviene con texto seleccionado, ni en los bordes', () => {
    expect(phoneDeletionRange(VISTO, 0, 12, 'backward')).toBeNull()
    expect(phoneDeletionRange(VISTO, 0, 0, 'backward')).toBeNull()
    expect(phoneDeletionRange(VISTO, 12, 12, 'forward')).toBeNull()
  })

  it('con solo separadores por delante, se los lleva y nada mas', () => {
    expect(phoneDeletionRange('  300', 2, 2, 'backward')).toEqual({ start: 0, end: 2 })
  })

  /**
   * La regresion de los espacios que sobraban. Se simula el bucle completo con
   * el cursor REAL —el que devuelve cada edicion—, no siempre al final: es la
   * unica forma de reproducir lo que encontro la prueba end-to-end, donde
   * borrar diez veces dejaba un campo con dos espacios dentro.
   */
  it('borrar hasta vaciar el campo funciona digito a digito', () => {
    let visto = '300 123 4567'
    let caret = visto.length
    const pasos: string[] = []

    for (let vuelta = 0; vuelta < 20 && visto !== ''; vuelta += 1) {
      const rango = phoneDeletionRange(visto, caret, caret, 'backward')
      const raw =
        rango === null
          ? visto.slice(0, caret - 1) + visto.slice(caret)
          : visto.slice(0, rango.start) + visto.slice(rango.end)
      const editado = applyPhoneEdit(raw, rango?.start ?? caret - 1)
      visto = editado.value
      caret = editado.caret
      pasos.push(visto)
    }

    expect(visto).toBe('')
    // Ni una vuelta en falso, ni un separador olvidado: diez digitos, diez
    // pulsaciones.
    expect(pasos).toHaveLength(10)
  })
})
