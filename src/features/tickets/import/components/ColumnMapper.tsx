'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
 */

type ColumnMapperProps = {
  headers: readonly string[]
  /** Primeras filas del archivo, para reconocer las columnas de un vistazo. */
  sampleRows: readonly (readonly string[])[]
  initial: ColumnMapping
  onConfirm: (mapping: ColumnMapping) => void
  onCancel: () => void
}

const SIN_ELEGIR = 'sin-elegir'

export function ColumnMapper({
  headers,
  sampleRows,
  initial,
  onConfirm,
  onCancel,
}: ColumnMapperProps) {
  const [daily, setDaily] = useState(initial.daily >= 0 ? String(initial.daily) : SIN_ELEGIR)
  const [weekly, setWeekly] = useState(initial.weekly >= 0 ? String(initial.weekly) : SIN_ELEGIR)
  const [clientName, setClientName] = useState(
    initial.clientName >= 0 ? String(initial.clientName) : SIN_ELEGIR,
  )
  const [clientPhone, setClientPhone] = useState(
    initial.clientPhone >= 0 ? String(initial.clientPhone) : SIN_ELEGIR,
  )
  const [abono, setAbono] = useState(initial.abono >= 0 ? String(initial.abono) : SIN_ELEGIR)

  const selected = [daily, weekly, clientName, clientPhone, abono].filter(
    (value) => value !== SIN_ELEGIR,
  )
  const noRepeatedColumns = new Set(selected).size === selected.length
  const completeClientPair =
    (clientName === SIN_ELEGIR && clientPhone === SIN_ELEGIR) ||
    (clientName !== SIN_ELEGIR && clientPhone !== SIN_ELEGIR)
  // Un abono sin cliente no se puede registrar: la boleta no estaria vendida.
  const abonoHasClient =
    abono === SIN_ELEGIR || (clientName !== SIN_ELEGIR && clientPhone !== SIN_ELEGIR)
  const listo =
    daily !== SIN_ELEGIR &&
    weekly !== SIN_ELEGIR &&
    noRepeatedColumns &&
    completeClientPair &&
    abonoHasClient

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="map-daily">¿Cuál columna es el premio diario?</Label>
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

        <div className="space-y-1.5">
          <Label htmlFor="map-weekly">¿Cuál columna es el premio semanal?</Label>
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

        <div className="space-y-1.5">
          <Label htmlFor="map-client-name">¿Cuál columna es el nombre del cliente?</Label>
          <Select value={clientName} onValueChange={setClientName}>
            <SelectTrigger id="map-client-name" className="w-full">
              <SelectValue placeholder="No incluir cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_ELEGIR}>No incluir cliente</SelectItem>
              {headers.map((_, index) => (
                <SelectItem key={index} value={String(index)}>
                  {etiqueta(index)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="map-client-phone">¿Cuál columna es el celular del cliente?</Label>
          <Select value={clientPhone} onValueChange={setClientPhone}>
            <SelectTrigger id="map-client-phone" className="w-full">
              <SelectValue placeholder="No incluir celular" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_ELEGIR}>No incluir celular</SelectItem>
              {headers.map((_, index) => (
                <SelectItem key={index} value={String(index)}>
                  {etiqueta(index)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="map-abono">¿Cuál columna es el abono?</Label>
          <Select value={abono} onValueChange={setAbono}>
            <SelectTrigger id="map-abono" className="w-full">
              <SelectValue placeholder="No incluir abono" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_ELEGIR}>No incluir abono</SelectItem>
              {headers.map((_, index) => (
                <SelectItem key={index} value={String(index)}>
                  {etiqueta(index)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!noRepeatedColumns ? (
        <p role="alert" className="text-destructive text-sm">
          Cada dato debe salir de una columna diferente.
        </p>
      ) : null}

      {!completeClientPair ? (
        <p role="alert" className="text-destructive text-sm">
          Para incluir clientes, elige las columnas de nombre y celular.
        </p>
      ) : null}

      {!abonoHasClient ? (
        <p role="alert" className="text-destructive text-sm">
          Para incluir abonos, elige también las columnas de nombre y celular del cliente.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!listo}
          onClick={() =>
            onConfirm({
              daily: Number(daily),
              weekly: Number(weekly),
              clientName: clientName === SIN_ELEGIR ? -1 : Number(clientName),
              clientPhone: clientPhone === SIN_ELEGIR ? -1 : Number(clientPhone),
              abono: abono === SIN_ELEGIR ? -1 : Number(abono),
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
