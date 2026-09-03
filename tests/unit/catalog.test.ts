/**
 * Piezas puras del catalogo publico (D-159, BR-K02, BR-K05, BR-K09).
 *
 * Lo que se comprueba aqui es lo que NO puede comprobar la base de datos: como
 * se construye un enlace, como se saluda a alguien y que texto exacto llega
 * escrito a WhatsApp. Los filtros, los estados publicos y los limites de pagina
 * viven en SQL y se prueban en `tests/db/public-catalog.test.ts`.
 */
import { describe, expect, it } from 'vitest'

import { catalogPublicUrl, isCatalogLive } from '@/features/catalog/queries'
import {
  SLUG_MAX_LENGTH,
  SLUG_REGEX,
  buildSellerSlug,
  isValidSlug,
  slugifyName,
} from '@/features/catalog/slug'
import {
  catalogWhatsappMessage,
  isValidWhatsappNumber,
  normalizeWhatsappNumber,
  shortSellerName,
  whatsappUrl,
} from '@/features/catalog/whatsapp'
import { catalogSettingsSchema } from '@/features/catalog/schemas'
import { catalogStats, percentageReserved } from '@/features/catalog/stats'
import {
  CATALOG_SHARE_PROMO,
  catalogShareData,
  catalogShareMessage,
  catalogShareTitle,
  isShareCancelled,
} from '@/features/catalog/share'
import { CATALOG_SEARCH_EMPTY_DESCRIPTION, catalogSearchHint } from '@/features/search/hints'

describe('slug: normalizacion (BR-K02)', () => {
  it('convierte un nombre en la parte legible de una URL', () => {
    expect(slugifyName('Laura Gómez')).toBe('laura-gomez')
    expect(slugifyName('JULIÁN  VARGAS')).toBe('julian-vargas')
    expect(slugifyName('Ana María Peña Ñuñez')).toBe('ana-maria-pena-nunez')
  })

  it('quita acentos, simbolos y guiones sobrantes', () => {
    expect(slugifyName('  José   Pérez  ')).toBe('jose-perez')
    // La tilde se separa y se elimina, asi que «Cía» queda «cia»: la letra se
    // conserva, no se convierte en un guion.
    expect(slugifyName('O’Connor & Cía.')).toBe('o-connor-cia')
    expect(slugifyName('---')).toBe('')
  })

  it('nunca deja mayusculas ni espacios', () => {
    for (const nombre of ['Laura Gómez', 'ÁÉÍÓÚ', 'a b c']) {
      const s = slugifyName(nombre)
      expect(s).toBe(s.toLowerCase())
      expect(s).not.toMatch(/\s/)
    }
  })
})

describe('slug: generacion (BR-K02, BR-K03)', () => {
  it('sale con la forma que exige la base de datos', () => {
    for (let i = 0; i < 50; i++) {
      const slug = buildSellerSlug('Laura Gómez')
      expect(slug).toMatch(SLUG_REGEX)
      expect(isValidSlug(slug)).toBe(true)
      expect(slug.startsWith('laura-gomez-')).toBe(true)
    }
  })

  it('el sufijo cambia: dos personas homonimas no comparten enlace', () => {
    const slugs = new Set(Array.from({ length: 200 }, () => buildSellerSlug('Laura Gómez')))
    // Con 31^4 combinaciones, 200 tiradas repetidas serian un fallo del azar.
    expect(slugs.size).toBeGreaterThan(190)
  })

  it('un nombre sin letras utilizables sigue dando un slug valido', () => {
    for (const nombre of ['---', '###', '  ', '你好']) {
      const slug = buildSellerSlug(nombre)
      expect(isValidSlug(slug), `«${nombre}» produjo «${slug}»`).toBe(true)
      expect(slug.startsWith('vendedor-')).toBe(true)
    }
  })

  it('un nombre larguisimo se recorta y sigue cabiendo en la columna', () => {
    const slug = buildSellerSlug('Maria '.repeat(40))
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH)
    expect(isValidSlug(slug)).toBe(true)
  })
})

describe('slug: validacion (BR-K02)', () => {
  it('acepta los que cumplen el formato', () => {
    for (const bueno of ['laura-gomez-k7m4', 'abc', 'a1-b2-c3', 'vendedor-9999']) {
      expect(isValidSlug(bueno), bueno).toBe(true)
    }
  })

  it('rechaza mayusculas, espacios, tildes, guiones sueltos y longitudes fuera de rango', () => {
    for (const malo of [
      'Laura-Gomez',
      'con espacio',
      'con-tildé',
      '-empieza',
      'termina-',
      'doble--guion',
      'ab',
      '',
      'x'.repeat(81),
      '../../etc/passwd',
      'laura_gomez',
    ]) {
      expect(isValidSlug(malo), `acepto «${malo}»`).toBe(false)
    }
  })
})

describe('WhatsApp: normalizacion (BR-K05)', () => {
  it('deja solo digitos', () => {
    expect(normalizeWhatsappNumber('+57 300 123-4567')).toBe('573001234567')
    expect(normalizeWhatsappNumber('(300) 123 4567')).toBe('573001234567')
  })

  it('a un celular colombiano de 10 cifras le pone el indicativo', () => {
    expect(normalizeWhatsappNumber('3001234567')).toBe('573001234567')
    expect(normalizeWhatsappNumber('300 123 4567')).toBe('573001234567')
  })

  it('no toca un numero que ya trae indicativo', () => {
    expect(normalizeWhatsappNumber('573001234567')).toBe('573001234567')
    expect(normalizeWhatsappNumber('5215512345678')).toBe('5215512345678')
  })

  it('un fijo de 10 cifras que no empieza por 3 se respeta tal cual', () => {
    expect(normalizeWhatsappNumber('6012345678')).toBe('6012345678')
  })

  it('devuelve null cuando no queda nada utilizable', () => {
    expect(normalizeWhatsappNumber('')).toBeNull()
    expect(normalizeWhatsappNumber('sin numeros')).toBeNull()
  })

  it('la validacion coincide con el CHECK de la base', () => {
    expect(isValidWhatsappNumber('573001234567')).toBe(true)
    expect(isValidWhatsappNumber('12345678')).toBe(true)
    for (const malo of ['0573001234567', '1234567', '1'.repeat(16), '+573001234567', '300 123']) {
      expect(isValidWhatsappNumber(malo), `acepto «${malo}»`).toBe(false)
    }
  })
})

describe('nombre corto del vendedor (BR-K09)', () => {
  it('manda el alias cuando existe', () => {
    expect(shortSellerName('Laura Gómez Restrepo', 'Lau')).toBe('Lau')
  })

  it('sin alias usa el primer nombre, no el nombre completo', () => {
    expect(shortSellerName('Laura Gómez Restrepo', null)).toBe('Laura')
    expect(shortSellerName('Julian Vargas', null)).toBe('Julian')
  })

  it('un alias en blanco no cuenta como alias', () => {
    expect(shortSellerName('Laura Gómez', '   ')).toBe('Laura')
    expect(shortSellerName('Laura Gómez', '')).toBe('Laura')
  })
})

describe('mensaje y enlace de WhatsApp (BR-K09)', () => {
  it('nombra la boleta por sus DOS numeros (BR-N11)', () => {
    expect(
      catalogWhatsappMessage({
        sellerShortName: 'Laura',
        dailyNumber: '1300',
        weeklyNumber: '5678',
      }),
    ).toBe(
      'Hola, Laura. Quiero solicitar la boleta con diario 1300 y semanal 5678 de la rifa. ¿Sigue disponible?',
    )
  })

  it('conserva los ceros iniciales dentro del mensaje (BR-N03)', () => {
    const mensaje = catalogWhatsappMessage({
      sellerShortName: 'Laura',
      dailyNumber: '0007',
      weeklyNumber: '0025',
    })
    expect(mensaje).toContain('diario 0007')
    expect(mensaje).toContain('semanal 0025')
    expect(mensaje).not.toContain('diario 7')
  })

  it('el enlace lleva el numero sin «+» y el mensaje codificado', () => {
    const url = whatsappUrl(
      '573001234567',
      catalogWhatsappMessage({
        sellerShortName: 'Laura',
        dailyNumber: '1300',
        weeklyNumber: '5678',
      }),
    )
    expect(url.startsWith('https://wa.me/573001234567?text=')).toBe(true)
    expect(url).not.toContain('+')
    expect(url).not.toContain(' ')
  })

  it('el espacio se codifica como %20, nunca como «+»', () => {
    // Con `+`, WhatsApp escribiria los signos literalmente en el mensaje.
    const url = whatsappUrl('573001234567', 'Hola, Laura. ¿Sigue disponible?')
    expect(url).toContain('%20')
    expect(decodeURIComponent(url.split('text=')[1]!)).toBe('Hola, Laura. ¿Sigue disponible?')
  })

  it('la interrogacion de apertura y las tildes sobreviven al viaje', () => {
    const mensaje = catalogWhatsappMessage({
      sellerShortName: 'José',
      dailyNumber: '0001',
      weeklyNumber: '0002',
    })
    const url = whatsappUrl('573001234567', mensaje)
    expect(decodeURIComponent(url.split('text=')[1]!)).toBe(mensaje)
    expect(mensaje).toContain('¿Sigue disponible?')
  })
})

describe('la direccion publica', () => {
  it('cuelga de /catalogo/ y no duplica la barra', () => {
    const url = catalogPublicUrl('laura-gomez-k7m4')
    expect(url.endsWith('/catalogo/laura-gomez-k7m4')).toBe(true)
    expect(url).not.toContain('//catalogo')
  })
})

describe('la configuracion que se guarda (BR-K04..BR-K06)', () => {
  const profileId = '00000000-0000-4000-8000-000000000001'
  const raffleId = '00000000-0000-4000-8000-000000000002'

  it('normaliza el WhatsApp al validar', () => {
    const parsed = catalogSettingsSchema.safeParse({
      profileId,
      enabled: true,
      whatsappNumber: '+57 300 123-4567',
      raffleId,
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.whatsappNumber).toBe('573001234567')
  })

  it('publicar sin WhatsApp se rechaza con un mensaje util', () => {
    const parsed = catalogSettingsSchema.safeParse({
      profileId,
      enabled: true,
      whatsappNumber: '',
      raffleId,
    })
    expect(parsed.success).toBe(false)
    expect(parsed.success === false && parsed.error.issues[0]?.message).toContain('WhatsApp')
  })

  it('publicar sin rifa se rechaza', () => {
    const parsed = catalogSettingsSchema.safeParse({
      profileId,
      enabled: true,
      whatsappNumber: '573001234567',
      raffleId: '',
    })
    expect(parsed.success).toBe(false)
    expect(parsed.success === false && parsed.error.issues[0]?.message).toContain('rifa')
  })

  it('apagado SI se puede guardar incompleto: apagar no borra nada', () => {
    const parsed = catalogSettingsSchema.safeParse({
      profileId,
      enabled: false,
      whatsappNumber: '',
      raffleId: '',
    })
    expect(parsed.success).toBe(true)
  })

  it('un WhatsApp con letras no pasa', () => {
    const parsed = catalogSettingsSchema.safeParse({
      profileId,
      enabled: false,
      whatsappNumber: 'no es un numero',
      raffleId: '',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('pistas del buscador publico', () => {
  it('no dice nada mientras el termino sirve', () => {
    expect(catalogSearchHint('')).toBeUndefined()
    expect(catalogSearchHint('7')).toBeUndefined()
    expect(catalogSearchHint('1300')).toBeUndefined()
  })

  it('avisa de que una boleta tiene 4 cifras como maximo (BR-N02)', () => {
    expect(catalogSearchHint('12345')).toBe('Los números tienen 4 cifras como máximo.')
  })

  it('avisa cuando se escriben letras, sin hablar de nada interno', () => {
    const pista = catalogSearchHint('abc')
    expect(pista).toBe('Escribe solo números.')
    // La pantalla es publica: no puede nombrar clientes ni codigos internos.
    expect(pista).not.toContain('cliente')
    expect(pista).not.toContain('código interno')
  })

  it('la lista vacia dice que hacer, sin repetir la regla de arriba', () => {
    expect(CATALOG_SEARCH_EMPTY_DESCRIPTION).toContain('borra la búsqueda')
    // La regla («4 cifras») vive en la pista del campo, no aqui: decirla en
    // los dos sitios la escribia dos veces en la misma pantalla.
    expect(CATALOG_SEARCH_EMPTY_DESCRIPTION).not.toContain('4 cifras')
  })
})

describe('mensaje para compartir el catálogo (BR-K13, D-161)', () => {
  const URL = 'https://rifas.example.com/catalogo/laura-gomez-k7m4'

  it('el encabezado se deriva del nombre de la rifa, no está escrito en el código', () => {
    expect(catalogShareTitle('Sorteo Camioneta KIA')).toBe(
      'Números disponibles — Sorteo Camioneta KIA',
    )
    expect(catalogShareTitle('Rifa Navidad 2026')).toBe('Números disponibles — Rifa Navidad 2026')
  })

  it('el bloque completo es exactamente el pedido', () => {
    expect(catalogShareMessage('Sorteo Camioneta KIA', URL)).toBe(
      'Números disponibles — Sorteo Camioneta KIA\n\n' +
        'Consulta mis números disponibles y solicita el que más te guste:\n\n' +
        URL,
    )
  })

  it('`text` lleva el encabezado, porque WhatsApp no usa `title`', () => {
    const data = catalogShareData('Sorteo Camioneta KIA', URL)
    expect(data.title).toBe('Números disponibles — Sorteo Camioneta KIA')
    expect(data.text).toContain('Números disponibles — Sorteo Camioneta KIA')
    expect(data.text).toContain('Consulta mis números disponibles y solicita el que más te guste:')
    expect(data.url).toBe(URL)
  })

  it('la dirección viaja en `url` y NO se repite dentro de `text`', () => {
    // Repetirla haría que WhatsApp la escribiera dos veces en el mismo mensaje.
    const data = catalogShareData('Sorteo Camioneta KIA', URL)
    expect(data.text).not.toContain(URL)
  })

  it('habla en primera persona: lo envía el vendedor, no la empresa', () => {
    expect(CATALOG_SHARE_PROMO).toContain('mis números')
  })
})

describe('cancelar el menú de compartir no es un error (BR-K13)', () => {
  it('`AbortError` es una cancelación', () => {
    const error = new Error('cancelado')
    error.name = 'AbortError'
    expect(isShareCancelled(error)).toBe(true)
  })

  it('cualquier otro fallo NO lo es: ahí sí se copia el enlace', () => {
    const notAllowed = new Error('sin permiso')
    notAllowed.name = 'NotAllowedError'
    expect(isShareCancelled(notAllowed)).toBe(false)

    expect(isShareCancelled(new Error('vaya'))).toBe(false)
    expect(isShareCancelled('AbortError')).toBe(false)
    expect(isShareCancelled(undefined)).toBe(false)
    expect(isShareCancelled({ name: 'AbortError' })).toBe(false)
  })
})

describe('cuándo el enlace abre de verdad (BR-K13)', () => {
  const base = {
    slug: 'laura-gomez-k7m4',
    enabled: true,
    whatsappNumber: '573001234567',
    raffleId: '00000000-0000-4000-8000-000000000002',
    raffleName: 'Sorteo Camioneta KIA',
    raffleActive: true,
  }

  it('con todo puesto, sí', () => {
    expect(isCatalogLive(base)).toBe(true)
  })

  it('sin configuración visible, no', () => {
    expect(isCatalogLive(null)).toBe(false)
  })

  it('apagado, no', () => {
    expect(isCatalogLive({ ...base, enabled: false })).toBe(false)
  })

  it('sin enlace generado, no', () => {
    expect(isCatalogLive({ ...base, slug: null })).toBe(false)
  })

  it('con la rifa cerrada, NO: el interruptor sigue encendido pero la página da 404', () => {
    expect(isCatalogLive({ ...base, raffleActive: false })).toBe(false)
  })
})

describe('las cifras del catalogo (D-164, BR-K14)', () => {
  it('el total es la suma, y se calcula en un solo sitio', () => {
    expect(catalogStats({ available: 14, taken: 36 })).toEqual({
      available: 14,
      taken: 36,
      total: 50,
    })
  })

  it('un catalogo vacio da 0 %, nunca NaN', () => {
    const stats = catalogStats({ available: 0, taken: 0 })
    expect(stats.total).toBe(0)

    const porcentaje = percentageReserved(stats)
    expect(porcentaje).toBe(0)
    expect(Number.isNaN(porcentaje)).toBe(false)
    expect(Number.isFinite(porcentaje)).toBe(true)
  })

  it('redondea al entero: 36 de 50 es 72 %', () => {
    expect(percentageReserved({ taken: 36, total: 50 })).toBe(72)
    expect(percentageReserved({ taken: 1, total: 3 })).toBe(33)
    expect(percentageReserved({ taken: 2, total: 3 })).toBe(67)
  })

  it('los extremos son exactos: nada vendido es 0 y todo vendido es 100', () => {
    expect(percentageReserved({ taken: 0, total: 50 })).toBe(0)
    expect(percentageReserved({ taken: 50, total: 50 })).toBe(100)
  })

  it('se acota a 0..100 aunque los datos vengan mal', () => {
    expect(percentageReserved({ taken: 80, total: 50 })).toBe(100)
    expect(percentageReserved({ taken: -10, total: 50 })).toBe(0)
  })

  it('un conteo que no es un numero finito no rompe la barra', () => {
    expect(percentageReserved({ taken: Number.NaN, total: 50 })).toBe(0)
    expect(percentageReserved({ taken: 10, total: Number.POSITIVE_INFINITY })).toBe(0)
    expect(catalogStats({ available: Number.NaN, taken: 5 })).toEqual({
      available: 0,
      taken: 5,
      total: 5,
    })
  })
})
