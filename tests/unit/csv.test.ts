import { describe, expect, it } from 'vitest'

import { csvFilename, csvHeaders, escapeCsvCell, toCsv } from '@/lib/csv'

const BOM = String.fromCharCode(0xfeff)

describe('escapeCsvCell', () => {
  it('deja pasar el texto simple sin tocarlo', () => {
    expect(escapeCsvCell('Ana Torres')).toBe('Ana Torres')
  })

  it('convierte null y undefined en celda vacia', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('entrecomilla cuando el valor contiene el separador', () => {
    expect(escapeCsvCell('Rojas; Beatriz')).toBe('"Rojas; Beatriz"')
  })

  it('entrecomilla y duplica las comillas internas', () => {
    expect(escapeCsvCell('Ana "La Flaca" Torres')).toBe('"Ana ""La Flaca"" Torres"')
  })

  it('entrecomilla los saltos de linea para no partir la fila', () => {
    expect(escapeCsvCell('linea uno\nlinea dos')).toBe('"linea uno\nlinea dos"')
  })

  it('convierte los numeros a texto', () => {
    expect(escapeCsvCell(100_000)).toBe('100000')
    expect(escapeCsvCell(0)).toBe('0')
  })
})

describe('escapeCsvCell — inyeccion de formulas', () => {
  it('neutraliza una formula de Excel anteponiendo una comilla', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1")
    expect(escapeCsvCell('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)")
  })

  it('neutraliza el caso clasico de ejecucion de comandos', () => {
    // Un cliente con este nombre ejecutaria codigo en la maquina de quien abra
    // el archivo si se exportara tal cual.
    expect(escapeCsvCell("=cmd|' /C calc'!A0")).toMatch(/^'=cmd/)
  })

  it('NO estropea un telefono que empieza por +', () => {
    expect(escapeCsvCell('+57 300 123 4567')).toBe('+57 300 123 4567')
  })

  it('NO estropea una cifra negativa', () => {
    expect(escapeCsvCell('-100.000')).toBe('-100.000')
  })

  it('neutraliza y ademas entrecomilla si tambien lleva separador', () => {
    expect(escapeCsvCell('=A1;B2')).toBe('"\'=A1;B2"')
  })
})

type Fila = { nombre: string; valor: number }

const COLUMNAS = [
  { header: 'Cliente', value: (row: Fila) => row.nombre },
  { header: 'Valor', value: (row: Fila) => row.valor },
]

describe('toCsv', () => {
  it('empieza por el BOM UTF-8 para que Excel respete las tildes', () => {
    // Comparado por PUNTO DE CODIGO: una expresion regular con el caracter
    // literal seria invisible y pasaria aunque el BOM se hubiera perdido.
    expect(toCsv(COLUMNAS, []).codePointAt(0)).toBe(0xfeff)
  })

  it('escribe el encabezado aunque no haya filas', () => {
    expect(toCsv(COLUMNAS, [])).toBe(`${BOM}Cliente;Valor\r\n`)
  })

  it('separa con punto y coma y termina cada linea con CRLF', () => {
    const csv = toCsv(COLUMNAS, [{ nombre: 'Ana Torres', valor: 100_000 }])
    expect(csv).toBe(`${BOM}Cliente;Valor\r\nAna Torres;100000\r\n`)
  })

  it('escribe una linea por fila, en el orden recibido', () => {
    const csv = toCsv(COLUMNAS, [
      { nombre: 'Ana', valor: 1 },
      { nombre: 'Carlos', valor: 2 },
    ])
    expect(csv.trimEnd().split('\r\n')).toEqual([`${BOM}Cliente;Valor`, 'Ana;1', 'Carlos;2'])
  })

  it('conserva el formato de moneda colombiano cuando la columna ya lo aplica', () => {
    const csv = toCsv([{ header: 'Total', value: () => '$100.000' }], [{ nombre: '', valor: 0 }])
    expect(csv).toContain('$100.000')
  })
})

describe('csvFilename', () => {
  it('compone prefijo y fecha', () => {
    expect(csvFilename('pagos', '2026-08-04')).toBe('pagos-2026-08-04.csv')
  })

  it('sanea cualquier caracter que pudiera partir la cabecera HTTP', () => {
    expect(csvFilename('re"porte\r\nX-Evil: 1', '2026-08-04')).toBe(
      're-porte--X-Evil--1-2026-08-04.csv',
    )
  })
})

describe('csvHeaders', () => {
  it('declara UTF-8 y descarga como adjunto', () => {
    const headers = csvHeaders('pagos-2026-08-04.csv')
    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8')
    expect(headers['Content-Disposition']).toBe('attachment; filename="pagos-2026-08-04.csv"')
  })

  it('prohibe el cacheo: un reporte es una foto del momento', () => {
    expect(csvHeaders('x.csv')['Cache-Control']).toBe('no-store')
  })
})
