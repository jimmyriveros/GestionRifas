'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { RaffleNumberFormat } from '@/lib/ticket-number-format'

import { importColumns } from '../sample'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { ColumnMapping } from '../columns'

/**
 * Paso intermedio: decir a mano que columna es cada numero.
 *
 * Aparece solo cuando los encabezados del archivo no se reconocen solos. La
 * alternativa —rechazar el archivo— obligaria a la persona a adivinar como
 * debe llamar sus columnas, y es justo el momento en que abandonaria.
 *
 * Se muestran las primeras filas del archivo junto a cada opcion para que se
 * pueda elegir mirando los datos, no el nombre de la columna.
 *
 * SOLO LOS NUMEROS, desde D-198 (BR-Q07). Ningun portal importa clientes ni
 * abonos, asi que aqui ya no se ofrece elegir sus columnas: seria mandar a la
 * persona por un camino que la vista previa rechaza. Las que el archivo ya traia
 * reconocidas pasan TAL CUAL, para que sus filas se aparten con su motivo en vez
 * de importarse sin avisar. Reactivar la importacion con clientes es devolver
 * desde Git los tres selectores que habia aqui.
 */

type ColumnMapperProps = {
  /** D-261: qué números pide la rifa y cómo se llaman. */
  numberFormat: RaffleNumberFormat
  headers: readonly string[]
  /** Primeras filas del archivo, para reconocer las columnas de un vistazo. */
  sampleRows: readonly (readonly string[])[]
  initial: ColumnMapping
  onConfirm: (mapping: ColumnMapping) => void
  onCancel: () => void
}

const SIN_ELEGIR = 'sin-elegir'

export function ColumnMapper({
  numberFormat,
  headers,
  sampleRows,
  initial,
  onConfirm,
  onCancel,
}: ColumnMapperProps) {
  const [daily, setDaily] = useState(initial.daily >= 0 ? String(initial.daily) : SIN_ELEGIR)
  const [weekly, setWeekly] = useState(initial.weekly >= 0 ? String(initial.weekly) : SIN_ELEGIR)

  // Las columnas de cliente y de abono que se reconocieron solas cuentan para no
  // repetir columna: un numero no puede salir de la misma columna que un nombre.
  const reconocidas = [initial.clientName, initial.clientPhone, initial.abono]
    .filter((index) => index >= 0)
    .map(String)
  const [, secondGroup] = numberFormat.groups
  const columns = importColumns(numberFormat)
  const question = (slot: 'daily_number' | 'weekly_number') =>
    columns.find((column) => column.slot === slot)?.question ?? ''
  const selected = [daily, ...(secondGroup ? [weekly] : []), ...reconocidas].filter(
    (value) => value !== SIN_ELEGIR,
  )
  const noRepeatedColumns = new Set(selected).size === selected.length
  const listo =
    daily !== SIN_ELEGIR && (!secondGroup || weekly !== SIN_ELEGIR) && noRepeatedColumns

  /** «Columna A — 7607, 3929…»: el nombre y un par de valores de muestra. */
  function etiqueta(index: number): string {
    const ejemplos = sampleRows
      .map((row) => row[index])
      .filter((valor): valor is string => Boolean(valor && valor.trim() !== ''))
      .slice(0, 3)

    const nombre = headers[index]?.trim() || `Columna ${index + 1}`
    return ejemplos.length > 0 ? `${nombre} — ${ejemplos.join(', ')}` : nombre
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        No reconocimos los nombres de las columnas. Dinos cuál es cada número y seguimos.
      </p>

      <div className={secondGroup ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4'}>
        <div className="space-y-1.5">
          <Label htmlFor="map-daily">{question('daily_number')}</Label>
          <Select value={daily} onValueChange={setDaily}>
            <SelectTrigger id="map-daily" className="w-full">
              <SelectValue placeholder="Elige una columna" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((_, index) => (
                <SelectItem key={index} value={String(index)}>
                  {etiqueta(index)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {secondGroup ? (
          <div className="space-y-1.5">
            <Label htmlFor="map-weekly">{question('weekly_number')}</Label>
            <Select value={weekly} onValueChange={setWeekly}>
              <SelectTrigger id="map-weekly" className="w-full">
                <SelectValue placeholder="Elige una columna" />
              </SelectTrigger>
              <SelectContent>
                {headers.map((_, index) => (
                  <SelectItem key={index} value={String(index)}>
                    {etiqueta(index)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {!noRepeatedColumns ? (
        <p role="alert" className="text-destructive text-sm">
          Cada dato debe salir de una columna diferente.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!listo}
          onClick={() =>
            onConfirm({
              daily: Number(daily),
              weekly: secondGroup ? Number(weekly) : -1,
              clientName: initial.clientName,
              clientPhone: initial.clientPhone,
              abono: initial.abono,
            })
          }
        >
          Continuar
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Elegir otro archivo
        </Button>
      </div>
    </div>
  )
}
