'use client'

import { CheckCircle2Icon, UploadIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { detectMapping, isMappingComplete } from '../columns'
import { parseCsv, type CsvTable } from '../csv'
import { ImportParseError } from '../errors'
import { parseJsonTickets } from '../json'
import { importableRows, reviewRows, type ImportReview } from '../review'
import { tableToRows, type ImportRow } from '../rows'
import type { ImportSource } from '../schemas'
import { checkTakenCombinations, importTickets, type ImportTicketsResult } from '../actions'
import { ColumnMapper } from './ColumnMapper'
import { ImportDropzone } from './ImportDropzone'
import { ImportPreview } from './ImportPreview'

/**
 * Importador de boletas desde un archivo (BR-N12, D-081).
 *
 * UN SOLO componente para los tres roles. No recibe el rol: recibe el CONTEXTO
 * —que rifa, que vendedor, a donde volver— y el servidor decide lo demas. Un
 * vendedor no puede pasar `sellerId`, y aunque lo hiciera la Server Action lo
 * ignora y usa el de su sesion.
 *
 * El recorrido es siempre el mismo y nunca se salta la parada:
 *
 *   elegir archivo → (mapear columnas si hace falta) → vista previa →
 *   confirmar → resultado
 *
 * Elegir un archivo NO escribe nada. Entre leerlo y guardarlo hay siempre una
 * pantalla que dice cuantas boletas entran, cuantas no y por que.
 */

type TicketImportDialogProps = {
  /** Rifa a la que van las boletas. La elige la pantalla, no el archivo. */
  raffleId: string
  /** Solo el personal lo manda. En el portal del vendedor va sin definir. */
  sellerId?: string
  /** Se deshabilita el importador si falta contexto (sin rifa, sin vendedor). */
  disabled?: boolean
  /** A donde llevar al terminar con exito. */
  successHref: string
}

type Paso = 'archivo' | 'mapeo' | 'vista-previa' | 'resultado'

export function TicketImportDialog({
  raffleId,
  sellerId,
  disabled,
  successHref,
}: TicketImportDialogProps) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [paso, setPaso] = useState<Paso>('archivo')
  const [source, setSource] = useState<ImportSource>('csv')
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [tabla, setTabla] = useState<CsvTable | null>(null)
  const [review, setReview] = useState<ImportReview | null>(null)
  const [comprobado, setComprobado] = useState(false)
  const [resultado, setResultado] = useState<ImportTicketsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * Se esta guardando de verdad, no solo comprobando.
   *
   * `isPending` no distingue las dos esperas —contrastar con la rifa y
   * guardar— porque las dos van por el mismo `useTransition`. Sin este estado,
   * el boton decia «Importando...» mientras aun no habia importado nada, que es
   * mentir sobre lo que esta pasando.
   */
  const [guardando, setGuardando] = useState(false)
  const [isPending, startTransition] = useTransition()

  /**
   * Cerrojo contra el doble envio.
   *
   * `isPending` deshabilita el boton, pero entre el clic y el siguiente render
   * cabe un segundo clic —o un `Enter` mantenido—. Un `ref` se actualiza al
   * momento, sin esperar a React. La red de seguridad de verdad sigue siendo la
   * restriccion unica de la base de datos: reenviar el mismo archivo no puede
   * duplicar boletas porque la combinacion ya existiria.
   */
  const enviando = useRef(false)

  function reiniciar() {
    setGuardando(false)
    setPaso('archivo')
    setTabla(null)
    setReview(null)
    setResultado(null)
    setError(null)
    setComprobado(false)
    setNombreArchivo('')
  }

  /** Contrasta las combinaciones con la rifa. Una sola llamada, nunca una por fila. */
  function revisar(filas: ImportRow[]) {
    // Primera pasada, sin base de datos: formato y repeticiones dentro del
    // archivo. Se pinta ya, para no dejar la pantalla en blanco esperando.
    const primera = reviewRows(filas)
    setReview(primera)
    setComprobado(false)
    setPaso('vista-previa')

    startTransition(async () => {
      const respuesta = await checkTakenCombinations({
        raffleId,
        // Solo las que pueden existir. Un «12345» no cabe en la columna, asi
        // que preguntarlo no aporta nada y ademas tumbaria la comprobacion
        // entera: la accion valida lo que recibe, como debe.
        combos: primera.rows
          .filter((fila) => fila.status !== 'invalid')
          .map((fila) => ({ dailyNumber: fila.dailyNumber, weeklyNumber: fila.weeklyNumber })),
      })

      if ('error' in respuesta) {
        // La vista previa sigue siendo util sin esto: formato y repeticiones
        // dentro del archivo ya estan revisados, y la base de datos tiene la
        // ultima palabra igualmente. Se dice, no se calla.
        setError(
          `${respuesta.error} Puedes continuar: al guardar se comprobará de nuevo contra la rifa.`,
        )
        setComprobado(true)
        return
      }

      setReview(reviewRows(filas, new Set(respuesta.data)))
      setComprobado(true)
    })
  }

  async function leerArchivo(file: File) {
    setError(null)
    setNombreArchivo(file.name)

    const esJson = file.name.toLowerCase().endsWith('.json') || file.type === 'application/json'
    setSource(esJson ? 'json' : 'csv')

    try {
      const texto = await file.text()

      if (esJson) {
        revisar(parseJsonTickets(texto))
        return
      }

      const leida = parseCsv(texto)
      setTabla(leida)

      const mapeo = detectMapping(leida.headers)
      if (!isMappingComplete(mapeo)) {
        setPaso('mapeo')
        return
      }

      revisar(tableToRows(leida, mapeo))
    } catch (problema) {
      setError(
        problema instanceof ImportParseError
          ? problema.message
          : 'No pudimos leer el archivo. Revisa que sea un CSV o un JSON y vuelve a intentarlo.',
      )
      setPaso('archivo')
    }
  }

  function confirmar() {
    if (!review || enviando.current) return

    const filas = importableRows(review)
    if (filas.length === 0) return

    enviando.current = true
    setGuardando(true)
    startTransition(async () => {
      const respuesta = await importTickets({
        raffleId,
        ...(sellerId ? { sellerId } : {}),
        source,
        rows: filas.map((fila) => ({
          dailyNumber: fila.dailyNumber,
          weeklyNumber: fila.weeklyNumber,
        })),
      })

      enviando.current = false
      setGuardando(false)

      if ('error' in respuesta) {
        setError(respuesta.error)
        return
      }

      setResultado(respuesta.data)
      setPaso('resultado')
      router.refresh()
    })
  }

  const importables = review ? review.valid : 0
  const descartadas = review ? review.total - review.valid : 0

  return (
    <>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setAbierto(true)}>
        <UploadIcon className="size-4" aria-hidden />
        Importar archivo
      </Button>

      <Dialog
        open={abierto}
        onOpenChange={(open) => {
          // Cerrar a mitad no deja nada a medias: no se ha escrito nada hasta
          // confirmar, asi que basta con olvidar el archivo.
          if (!open && !isPending) {
            setAbierto(false)
            reiniciar()
          } else if (open) {
            setAbierto(true)
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importar boletas desde un archivo</DialogTitle>
            <DialogDescription>
              {paso === 'resultado'
                ? 'Esto fue lo que ocurrió.'
                : 'Revisarás las boletas antes de guardar nada.'}
            </DialogDescription>
          </DialogHeader>

          {paso === 'archivo' ? (
            <ImportDropzone onFile={leerArchivo} disabled={isPending} error={error} />
          ) : null}

          {paso === 'mapeo' && tabla ? (
            <ColumnMapper
              headers={tabla.headers}
              sampleRows={tabla.rows.slice(0, 3)}
              initial={detectMapping(tabla.headers)}
              onConfirm={(mapeo) => revisar(tableToRows(tabla, mapeo))}
              onCancel={reiniciar}
            />
          ) : null}

          {paso === 'vista-previa' && review ? (
            <div className="space-y-4">
              <p className="text-muted-foreground text-xs">Archivo: {nombreArchivo}</p>

              <ImportPreview review={review} checked={comprobado} />

              {error ? (
                <p
                  role="alert"
                  className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
                >
                  {error}
                </p>
              ) : null}

              {descartadas > 0 && importables > 0 ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
                  Se importarán <strong>{importables}</strong> boletas. Las otras{' '}
                  <strong>{descartadas}</strong> quedarán fuera y las verás marcadas en la tabla de
                  arriba.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={confirmar}
                  disabled={isPending || importables === 0 || !comprobado}
                >
                  {guardando
                    ? 'Importando...'
                    : !comprobado
                      ? 'Comprobando...'
                      : descartadas > 0
                        ? `Importar solo las ${importables} que sirven`
                        : `Importar ${importables} boleta(s)`}
                </Button>
                <Button type="button" variant="outline" onClick={reiniciar} disabled={isPending}>
                  Elegir otro archivo
                </Button>
              </div>

              {importables === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Ninguna boleta de este archivo se puede importar. Corrige el archivo y vuelve a
                  subirlo.
                </p>
              ) : null}
            </div>
          ) : null}

          {paso === 'resultado' && resultado ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    {resultado.inserted === 1
                      ? 'Se creó 1 boleta.'
                      : `Se crearon ${resultado.inserted} boletas.`}
                  </p>
                  {resultado.conflicts.length > 0 ? (
                    <p className="text-muted-foreground">
                      {resultado.conflicts.length} quedaron fuera porque su combinación ya existe en
                      la rifa: {resultado.conflicts.slice(0, 10).join(', ')}
                      {resultado.conflicts.length > 10 ? '…' : ''}
                    </p>
                  ) : null}
                  {resultado.auditFailed ? (
                    <p className="text-muted-foreground">
                      Las boletas quedaron guardadas, pero no pudimos registrar la importación en el
                      historial.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setAbierto(false)
                    reiniciar()
                    router.push(successHref)
                  }}
                >
                  Ver las boletas
                </Button>
                <Button type="button" variant="outline" onClick={reiniciar}>
                  Importar otro archivo
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
