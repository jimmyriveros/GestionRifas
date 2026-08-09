'use client'

import { FileSpreadsheetIcon, UploadIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { BULK_TICKET_MAX } from '@/lib/constants'

import {
  SAMPLE_CSV,
  SAMPLE_CSV_WITH_CLIENTS,
  SAMPLE_JSON,
  SAMPLE_JSON_WITH_CLIENTS,
} from '../sample'

/**
 * Primer paso: elegir el archivo.
 *
 * Pensado para alguien que lleva sus boletas en Excel y nunca ha «importado»
 * nada. Por eso, en este orden: que se necesita, el boton para elegir el
 * archivo, y un ejemplo descargable que ya trae los encabezados correctos. El
 * formato JSON existe pero se guarda detras de un enlace: quien lo necesita lo
 * busca, y a quien no, no le estorba.
 */

type ImportDropzoneProps = {
  onFile: (file: File) => void
  disabled?: boolean
  /** Mensaje del intento anterior, si el archivo no se pudo leer. */
  error?: string | null
  allowClientAssignments?: boolean
}

/** 1 MB. Mil boletas ocupan unos 15 KB: nada legitimo se acerca a este tope. */
const MAX_BYTES = 1024 * 1024

function descargar(nombre: string, contenido: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

export function ImportDropzone({
  onFile,
  disabled,
  error,
  allowClientAssignments,
}: ImportDropzoneProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [verJson, setVerJson] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [tamanoError, setTamanoError] = useState<string | null>(null)

  function aceptar(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setTamanoError('El archivo es demasiado grande. Sube uno con hasta 1.000 boletas.')
      return
    }
    setTamanoError(null)
    onFile(file)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm">
        <p>Puedes subir un archivo CSV exportado desde Excel.</p>
        <p className="text-muted-foreground">
          Necesitamos dos columnas: <strong>Premio semanal</strong> y <strong>Premio diario</strong>
          . Hasta {BULK_TICKET_MAX} boletas por archivo.
        </p>
        {allowClientAssignments ? (
          <p className="text-muted-foreground">
            Puedes añadir <strong>Cliente</strong> y <strong>Celular</strong>. Si incluyes uno,
            necesitas ambos.
          </p>
        ) : null}
      </div>

      {/* El area de arrastre es una comodidad; el boton y el campo son lo que
          de verdad funciona en un teléfono y con el teclado. */}
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(event) => {
          event.preventDefault()
          setArrastrando(false)
          if (!disabled) aceptar(event.dataTransfer.files[0])
        }}
        className={
          arrastrando
            ? 'border-primary bg-primary/5 rounded-lg border-2 border-dashed p-6 text-center'
            : 'rounded-lg border-2 border-dashed p-6 text-center'
        }
      >
        <FileSpreadsheetIcon className="text-muted-foreground mx-auto size-8" aria-hidden />
        <p className="text-muted-foreground mt-2 text-sm">
          Arrastra aquí tu archivo, o elígelo desde tu equipo.
        </p>

        <label htmlFor={inputId} className="sr-only">
          Archivo de boletas en CSV o JSON
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            aceptar(event.target.files?.[0])
            // Permite volver a elegir el MISMO archivo tras corregirlo: sin
            // esto, el navegador no dispara `change` la segunda vez.
            event.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon className="size-4" aria-hidden />
          Elegir archivo
        </Button>
      </div>

      {tamanoError || error ? (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {tamanoError ?? error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            descargar(
              'boletas-ejemplo.csv',
              allowClientAssignments ? SAMPLE_CSV_WITH_CLIENTS : SAMPLE_CSV,
              'text/csv;charset=utf-8',
            )
          }
        >
          Descargar archivo de ejemplo
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setVerJson((v) => !v)}>
          {verJson ? 'Ocultar el formato JSON' : 'Ver formato JSON'}
        </Button>
      </div>

      {verJson ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            Opción avanzada. Escribe los números <strong>entre comillas</strong> para no perder los
            ceros de delante.
          </p>
          <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
            {allowClientAssignments ? SAMPLE_JSON_WITH_CLIENTS : SAMPLE_JSON}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
