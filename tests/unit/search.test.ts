import { describe, expect, it } from 'vitest'

import {
  SEARCH_MIN_CHARS,
  digitsOnly,
  foldForSearch,
  isPhoneLikeTerm,
  isTicketNumberTerm,
  meetsMinChars,
  normalizeSearchTerm,
  searchNeedle,
} from '@/lib/search'
import { ticketSearchEmptyDescription, ticketSearchHint } from '@/features/search/hints'
import { ticketLabel } from '@/lib/tickets'

/**
 * Normalizacion del termino de busqueda (D-078).
 *
 * Estas reglas se aplican en DOS sitios —el navegador, para decidir si toca
 * buscar, y el servidor, para construir la consulta— y tienen que dar lo mismo
 * en los dos. Ademas deben coincidir con `search_normalize()` de la migracion
 * 0017; esa correspondencia la comprueba `tests/db/search.test.ts`, porque solo
 * se puede verificar contra PostgreSQL de verdad.
 */

describe('normalizeSearchTerm', () => {
  it('quita los espacios de los extremos', () => {
    expect(normalizeSearchTerm('  ana  ')).toBe('ana')
  })

  it('colapsa los espacios de dentro: al escribir se cuelan dobles', () => {
    expect(normalizeSearchTerm('ana   maria')).toBe('ana maria')
  })

  it('deja igual lo que ya estaba bien', () => {
    expect(normalizeSearchTerm('ana maria')).toBe('ana maria')
  })
})

describe('foldForSearch', () => {
  it('ignora mayusculas', () => {
    expect(foldForSearch('MARÍA')).toBe('maria')
  })

  it('ignora las tildes: «Jose» debe encontrar a «José»', () => {
    expect(foldForSearch('José')).toBe('jose')
    expect(foldForSearch('jose')).toBe('jose')
  })

  it('cubre las cinco vocales acentuadas y la dieresis', () => {
    expect(foldForSearch('á é í ó ú ü')).toBe('a e i o u u')
  })

  it('pliega la ñ a n, igual que hace la base de datos', () => {
    // Es deliberado: quien escribe «munoz» espera encontrar a «Muñoz».
    expect(foldForSearch('Muñoz')).toBe('munoz')
  })

  it('normaliza tambien los espacios, para no tener que encadenar dos pasos', () => {
    expect(foldForSearch('  PEÑA   Ríos ')).toBe('pena rios')
  })
})

describe('digitsOnly', () => {
  it('deja solo los digitos de un telefono escrito a mano', () => {
    expect(digitsOnly('+57 (300) 555-0000')).toBe('573005550000')
  })

  it('devuelve cadena vacia si no hay ningun digito', () => {
    expect(digitsOnly('ana')).toBe('')
  })
})

describe('isPhoneLikeTerm', () => {
  it('reconoce un telefono con separadores', () => {
    expect(isPhoneLikeTerm('300 555-0000')).toBe(true)
    expect(isPhoneLikeTerm('+573005550000')).toBe(true)
  })

  it('no confunde un numero de boleta corto con un telefono', () => {
    // Con menos de 3 digitos se trata como texto: «07» es una boleta.
    expect(isPhoneLikeTerm('07')).toBe(false)
  })

  it('no toma por telefono nada que lleve letras', () => {
    expect(isPhoneLikeTerm('ana')).toBe(false)
    expect(isPhoneLikeTerm('R001-000123')).toBe(false)
  })
})

describe('searchNeedle', () => {
  it('un telefono se reduce a su numero nacional, sea cual sea el formato', () => {
    // Los cuatro formatos tienen que producir EXACTAMENTE el mismo termino: es
    // lo que permite encontrar el mismo telefono escrito de cuatro maneras.
    for (const escrito of ['+57 300 555-0000', '57 (300) 5550000', '573005550000', '3005550000']) {
      expect(searchNeedle(escrito)).toBe('3005550000')
    }
  })

  /**
   * La regresion de I-039, en las DOS direcciones.
   *
   * El fallo original solo se veia en una: buscar con indicativo un telefono
   * guardado sin el. La prueba anterior probaba la contraria, que ya funcionaba,
   * y por eso el defecto llego a produccion.
   */
  it('el termino es subcadena del teléfono guardado, se guarde con indicativo o sin él', () => {
    const guardadoSinIndicativo = '3005550000'
    const guardadoConIndicativo = '573005550000'

    for (const escrito of ['+57 (300) 555-0000', '3005550000', '300 555 0000']) {
      const needle = searchNeedle(escrito)
      expect(guardadoSinIndicativo).toContain(needle)
      expect(guardadoConIndicativo).toContain(needle)
    }
  })

  it('un teléfono más corto que el nacional se deja tal cual (fijos de 7 dígitos)', () => {
    expect(searchNeedle('2345678')).toBe('2345678')
  })

  it('un nombre se dobla a minusculas y sin acentos', () => {
    expect(searchNeedle('  José  ')).toBe('jose')
  })
})

describe('meetsMinChars', () => {
  it('cuenta sobre el termino ya normalizado, no sobre lo tecleado', () => {
    // «  a  » son cinco caracteres escritos y uno real: no debe disparar nada.
    expect(meetsMinChars('  a  ', 2)).toBe(false)
    expect(meetsMinChars(' an ', 2)).toBe(true)
  })

  it('respeta el minimo de cada tipo de pantalla', () => {
    expect(meetsMinChars('an', SEARCH_MIN_CHARS.people)).toBe(true)
    expect(meetsMinChars('an', SEARCH_MIN_CHARS.general)).toBe(false)
    expect(meetsMinChars('07', SEARCH_MIN_CHARS.tickets)).toBe(true)
  })
})

describe('isTicketNumberTerm', () => {
  it('acepta de 1 a 4 digitos, conservando los ceros', () => {
    for (const term of ['7', '07', '007', '0007', '9999']) {
      expect(isTicketNumberTerm(term)).toBe(true)
    }
  })

  it('rechaza mas de 4 digitos y cualquier cosa que no sea un numero', () => {
    for (const term of ['12345', '12A4', '-123', '12.5', 'R001']) {
      expect(isTicketNumberTerm(term)).toBe(false)
    }
  })

  it('rechaza un codigo interno: dejo de servir para buscar (BR-N11)', () => {
    expect(isTicketNumberTerm('R001-000019')).toBe(false)
    expect(isTicketNumberTerm('000019')).toBe(false)
  })
})

describe('ticketLabel (BR-N11)', () => {
  it('nombra la boleta por sus dos numeros, no por su codigo', () => {
    expect(ticketLabel({ dailyNumber: '1234', weeklyNumber: '5678' })).toBe('1234 / 5678')
  })

  it('conserva los ceros de delante', () => {
    expect(ticketLabel({ dailyNumber: '0017', weeklyNumber: '0042' })).toBe('0017 / 0042')
  })

  it('una boleta en borrador puede no tener numeros todavia', () => {
    expect(ticketLabel({ dailyNumber: null, weeklyNumber: null })).toBe('Sin números')
    expect(ticketLabel({ dailyNumber: '0400', weeklyNumber: null })).toBe('0400 / —')
  })
})

describe('ticketSearchHint', () => {
  it('no dice nada cuando el termino sirve', () => {
    expect(ticketSearchHint('1234')).toBeUndefined()
    expect(ticketSearchHint('')).toBeUndefined()
  })

  it('avisa cuando se escribe algo que no es un numero', () => {
    expect(ticketSearchHint('R001')).toContain('solo cifras')
  })

  it('avisa cuando se pasa de cuatro cifras', () => {
    expect(ticketSearchHint('12345')).toContain('4 cifras')
  })
})

describe('ticketSearchEmptyDescription', () => {
  it('explica que el codigo interno no sirve para buscar', () => {
    const texto = ticketSearchEmptyDescription('R001-000019', true)
    expect(texto).toContain('código interno')
  })

  it('con un numero valido y sin resultados, invita a probar otro', () => {
    expect(ticketSearchEmptyDescription('1234', true)).toContain('otro número')
  })

  it('sin busqueda ni filtros deja hablar a la pantalla', () => {
    expect(ticketSearchEmptyDescription(undefined, false)).toBeUndefined()
  })
})
