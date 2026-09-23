import { describe, expect, it } from 'vitest'

import {
  CLIENT_DEFAULT_SORT,
  CLIENT_SORT_COLUMNS,
  CLIENT_SORT_OPTIONS,
  describeClientSort,
} from '@/features/clients/sort-options'
import {
  ADMIN_TICKET_SORT_COLUMNS,
  describeStaffTicketSort,
  describeTicketSort,
  STAFF_TICKET_SORT_OPTIONS,
  TICKET_SORT_COLUMNS,
  TICKET_SORT_OPTIONS,
} from '@/features/tickets/sort-options'

/**
 * Las opciones del control del telefono (I-155, D-215).
 *
 * Lo que se guarda aqui es la union entre dos listas que viven separadas: lo
 * que la pantalla OFRECE y lo que la consulta ADMITE. Si se separan, el control
 * pide un orden que `parseListSort` descarta en silencio: la lista sale en el
 * orden de siempre y el control se queda diciendo otra cosa. No es un fallo
 * ruidoso, y por eso conviene una prueba.
 */

describe('opciones de orden del telefono', () => {
  const casos = [
    { nombre: 'Mis boletas', opciones: TICKET_SORT_OPTIONS, permitidas: TICKET_SORT_COLUMNS },
    { nombre: 'Mis clientes', opciones: CLIENT_SORT_OPTIONS, permitidas: CLIENT_SORT_COLUMNS },
    {
      nombre: 'Boletas del personal',
      opciones: STAFF_TICKET_SORT_OPTIONS,
      permitidas: ADMIN_TICKET_SORT_COLUMNS,
    },
  ] as const

  it.each(casos)('$nombre: ninguna opción pide una columna que la consulta rechace', (caso) => {
    for (const opcion of caso.opciones) {
      if (opcion.sort === null) continue
      expect(caso.permitidas as readonly string[], opcion.label).toContain(opcion.sort.column)
    }
  })

  it.each(casos)('$nombre: la primera opción es el orden por defecto', (caso) => {
    // `null` borra `sort` y `dir` de la direccion, que es como se vuelve al
    // orden de siempre. Tiene que ser la primera para que se encuentre.
    expect(caso.opciones[0]?.sort).toBeNull()
    expect(caso.opciones.filter((opcion) => opcion.sort === null)).toHaveLength(1)
  })

  it.each(casos)('$nombre: no hay dos opciones que pidan lo mismo', (caso) => {
    const claves = caso.opciones.map((opcion) =>
      opcion.sort === null ? 'default' : `${opcion.sort.column}:${opcion.sort.direction}`,
    )
    expect(new Set(claves).size).toBe(claves.length)
  })

  it.each(casos)('$nombre: no hay dos opciones que se lean igual', (caso) => {
    const textos = caso.opciones.map((opcion) => opcion.label)
    expect(new Set(textos).size).toBe(textos.length)
  })

  it.each(casos)('$nombre: cada columna ofrecida se puede pedir en los dos sentidos', (caso) => {
    // Elegir el sentido es parte del encargo: una columna con una sola
    // direccion dejaria a quien la usa sin forma de darle la vuelta, que en el
    // telefono es lo unico que hay —no hay cabecera que volver a pulsar—.
    const porColumna = new Map<string, Set<string>>()
    for (const opcion of caso.opciones) {
      if (opcion.sort === null) continue
      const sentidos = porColumna.get(opcion.sort.column) ?? new Set<string>()
      sentidos.add(opcion.sort.direction)
      porColumna.set(opcion.sort.column, sentidos)
    }

    for (const [columna, sentidos] of porColumna) {
      // El nombre por defecto de «Mis clientes» ya ocupa el ascendente: su
      // columna solo necesita el descendente como opcion propia.
      const esperados = columna === 'name' ? 1 : 2
      expect(sentidos.size, columna).toBe(esperados)
    }
  })

  it('no se ofrece ordenar por un ESTADO: eso se filtra', () => {
    // Ordenar por un estado responde peor la pregunta que ya responde el
    // filtro, que esta a un toque, y ademas no hay forma clara de decir su
    // sentido. Se deja fuera a proposito, no por olvido.
    const columnas = [...TICKET_SORT_OPTIONS, ...CLIENT_SORT_OPTIONS, ...STAFF_TICKET_SORT_OPTIONS]
      .map((opcion) => opcion.sort?.column)
      .filter((columna): columna is string => columna !== undefined)

    expect(columnas).not.toContain('inventoryStatus')
    expect(columnas).not.toContain('paymentStatus')
    expect(columnas).not.toContain('archivedAt')
    expect(columnas).not.toContain('paymentState')
  })

  it('cada texto dice la columna Y el sentido', () => {
    // En el telefono no hay cabecera que pulsar dos veces, asi que la frase
    // entera es lo unico que anuncia hacia donde ordena.
    for (const opcion of [
      ...TICKET_SORT_OPTIONS,
      ...CLIENT_SORT_OPTIONS,
      ...STAFF_TICKET_SORT_OPTIONS,
    ]) {
      if (opcion.sort === null) continue
      expect(opcion.label, opcion.label).toMatch(/, de (mayor a menor|menor a mayor|más a menos|menos a más|la A a la Z|la Z a la A)$/)
    }
  })
})

/**
 * NINGUNA COLUMNA ADMITIDA SE QUEDA SIN PALABRAS (D-216, corregido).
 *
 * El control ofrece menos columnas de las que la consulta acepta, y eso está
 * bien. Lo que no puede pasar es que una dirección pida un orden que la
 * consulta APLICA y el control no sepa nombrarlo: ahí el selector se queda sin
 * valor que enseñar, o peor, enseña otro.
 *
 * Hay tres formas válidas de representarlo, y basta con una:
 *
 *   1. una opción de la lista con esa misma columna y sentido;
 *   2. la función `describe`, para las que no se ofrecen;
 *   3. coincidir con el orden por defecto de la lista, que ya tiene su opción
 *      —es el caso de `?sort=name` en clientes—.
 *
 * Se recorren TODAS las columnas en LOS DOS sentidos, que es lo que hace que
 * añadir una a la lista blanca sin darle palabras falle aquí y no en la
 * pantalla de alguien.
 */
describe('cada columna admitida tiene representación, en los dos sentidos', () => {
  const pantallas = [
    {
      nombre: 'Mis boletas',
      columnas: TICKET_SORT_COLUMNS,
      opciones: TICKET_SORT_OPTIONS,
      describe: describeTicketSort,
      porDefecto: undefined,
    },
    {
      nombre: 'Mis clientes',
      columnas: CLIENT_SORT_COLUMNS,
      opciones: CLIENT_SORT_OPTIONS,
      describe: describeClientSort,
      porDefecto: CLIENT_DEFAULT_SORT,
    },
    {
      nombre: 'Boletas del personal',
      columnas: ADMIN_TICKET_SORT_COLUMNS,
      opciones: STAFF_TICKET_SORT_OPTIONS,
      describe: describeStaffTicketSort,
      porDefecto: undefined,
    },
  ] as const

  for (const pantalla of pantallas) {
    for (const column of pantalla.columnas) {
      for (const direction of ['asc', 'desc'] as const) {
        it(`${pantalla.nombre}: «${column}» ${direction}`, () => {
          const sort = { column, direction }

          const ofrecida = pantalla.opciones.some(
            (opcion) =>
              opcion.sort !== null &&
              opcion.sort.column === column &&
              opcion.sort.direction === direction,
          )
          const esElDefecto =
            pantalla.porDefecto !== undefined &&
            pantalla.porDefecto.column === column &&
            pantalla.porDefecto.direction === direction
          const descrita = pantalla.describe(sort)

          const representado = ofrecida || esElDefecto || descrita !== null
          expect(representado, `${column} ${direction} se queda sin palabras`).toBe(true)

          // Y si le toca describirla, la frase tiene que decir algo: ni vacía
          // ni el nombre de la columna a secas.
          if (!ofrecida && !esElDefecto) {
            expect(descrita).toBeTruthy()
            expect(descrita).not.toBe(column)
            expect((descrita ?? '').length).toBeGreaterThan(4)
          }
        })
      }
    }
  }

  it('el orden por defecto escrito de «Mis clientes» es el que aplica la consulta', () => {
    // `listClients` ordena por `name` ascendente cuando nadie pide otra cosa.
    // Si eso cambiara, `?sort=name` dejaría de ser la misma lista y el control
    // lo estaría representando mal.
    expect(CLIENT_DEFAULT_SORT).toEqual({ column: 'name', direction: 'asc' })
  })

  it('«Mis boletas» no declara orden por defecto escrito, y es correcto', () => {
    // Su orden de siempre es `created_at`, que NO está en la lista blanca: no
    // se puede pedir por la dirección, así que no hay nada que equiparar.
    expect(TICKET_SORT_COLUMNS as readonly string[]).not.toContain('createdAt')
  })
})

/**
 * EL PERSONAL NO ORDENA POR CLIENTE NI POR DINERO (I-155 en su portal, D-198).
 *
 * Ordenar por una columna es preguntar por ella: «Falta, de mayor a menor» y
 * mirar la primera tarjeta diría quién debe más sin que ninguna celda lo
 * escriba. La consulta ya lo rechaza; esto vigila que el TELÉFONO ni siquiera
 * lo ofrezca, ni lo describa.
 */
describe('las opciones del personal respetan la lista blanca de D-198', () => {
  const PRIVADAS = [
    'clientName',
    'paidAmount',
    'pendingAmount',
    'percentage',
    'salePrice',
    'paymentStatus',
  ]

  it('ninguna opción ni la lista blanca nombran cliente o dinero', () => {
    const ofrecidas = STAFF_TICKET_SORT_OPTIONS.map((opcion) => opcion.sort?.column).filter(
      (columna): columna is string => columna !== undefined,
    )
    for (const columna of PRIVADAS) {
      expect(ofrecidas).not.toContain(columna)
      expect(ADMIN_TICKET_SORT_COLUMNS as readonly string[]).not.toContain(columna)
      // Tampoco se describe: el control no pone palabras a lo que no aplica.
      expect(describeStaffTicketSort({ column: columna, direction: 'asc' })).toBeNull()
    }
  })

  it('ofrece lo que la tarjeta del personal enseña: boleta, rifa y vendedor', () => {
    const columnas = new Set(
      STAFF_TICKET_SORT_OPTIONS.map((opcion) => opcion.sort?.column).filter(Boolean),
    )
    expect([...columnas].sort()).toEqual(['dailyNumber', 'raffleShortCode', 'sellerName'])
  })
})

/**
 * LAS FRASES DEL PERSONAL DESCRIBEN EL ORDEN DE `admin_list_tickets`, que no
 * es el de la vista del vendedor: allí los estados se comparan como TEXTO
 * (`inventory_status::text`), así que el primero es «Asignada» y no «Borrador».
 * Las frases se escriben a mano, no con la función que las produce.
 */
describe('describeStaffTicketSort', () => {
  it.each([
    ['inventoryStatus', 'asc', 'Estado de la boleta, primero Asignada'],
    ['inventoryStatus', 'desc', 'Estado de la boleta, primero Pendiente de aprobación'],
    ['paymentState', 'asc', 'Estado de pago, primero Pagada'],
    ['paymentState', 'desc', 'Estado de pago, primero Sin pagar'],
    ['clearance', 'asc', 'Paz y salvo, primero Entregado'],
    ['clearance', 'desc', 'Paz y salvo, primero Por entregar'],
  ] as const)('%s %s → «%s»', (column, direction, frase) => {
    expect(describeStaffTicketSort({ column, direction })).toBe(frase)
  })

  it('las columnas ofrecidas no se describen: ya tienen su opción', () => {
    for (const column of ['dailyNumber', 'raffleShortCode', 'sellerName']) {
      expect(describeStaffTicketSort({ column, direction: 'asc' })).toBeNull()
    }
  })
})
