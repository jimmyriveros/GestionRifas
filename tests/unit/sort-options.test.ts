import { describe, expect, it } from 'vitest'

import { CLIENT_SORT_OPTIONS } from '@/features/clients/sort-options'
import { TICKET_SORT_OPTIONS } from '@/features/tickets/sort-options'
import { CLIENT_SORT_COLUMNS } from '@/features/clients/queries'
import { TICKET_SORT_COLUMNS } from '@/features/tickets/queries'

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
    const columnas = [...TICKET_SORT_OPTIONS, ...CLIENT_SORT_OPTIONS]
      .map((opcion) => opcion.sort?.column)
      .filter((columna): columna is string => columna !== undefined)

    expect(columnas).not.toContain('inventoryStatus')
    expect(columnas).not.toContain('paymentStatus')
    expect(columnas).not.toContain('archivedAt')
  })

  it('cada texto dice la columna Y el sentido', () => {
    // En el telefono no hay cabecera que pulsar dos veces, asi que la frase
    // entera es lo unico que anuncia hacia donde ordena.
    for (const opcion of [...TICKET_SORT_OPTIONS, ...CLIENT_SORT_OPTIONS]) {
      if (opcion.sort === null) continue
      expect(opcion.label, opcion.label).toMatch(/, de (mayor a menor|menor a mayor|más a menos|menos a más|la A a la Z|la Z a la A)$/)
    }
  })
})
