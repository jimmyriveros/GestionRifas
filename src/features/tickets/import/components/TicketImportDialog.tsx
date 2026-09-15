'use client'

import { CheckCircle2Icon, UploadIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Notice } from '@/components/feedback/Notice'
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
import { checkImportPreview, importTickets, type ImportTicketsResult } from '../actions'
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
 * SOLO BOLETAS SIN VENDER, desde D-198 (BR-Q07). Ningun portal importa clientes
 * ni abonos: la vista previa aparta esas filas con su motivo y la Server Action
 * las vuelve a rechazar.
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
    // Primera pasada, sin base de datos: formato, repeticiones dentro del
    // archivo y filas que traen cliente o abono. Se pinta ya, para no dejar la
    // pantalla en blanco esperando.
    const primera = reviewRows(filas)
    setReview(primera)
    setComprobado(false)
    setPaso('vista-previa')

    startTransition(async () => {
      const respuesta = await checkImportPreview({
        raffleId,
        // Solo las que pueden existir. Un «12345» no cabe en la columna, asi
        // que preguntarlo no aporta nada y ademas tumbaria la comprobacion
        // entera: la accion valida lo que recibe, como debe.
        rows: primera.rows
          .filter((fila) => fila.status === 'valid')
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

      setReview(reviewRows(filas, { existingCombos: new Set(respuesta.data.taken) }))
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
      // Desde D-198 solo se para a preguntar por los NUMEROS (BR-Q07). Pedir el
      // par del cliente, o un cliente para el abono —lo que añade
      // `needsManualMapping`—, mandaria a la persona por un camino que la vista
      // previa rechaza: las columnas de cliente y de abono que se reconozcan
      // entran igual en el mapeo y sus filas se apartan con su motivo.
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
        {/* El techo de alto ya no se pone aqui: lo trae `DialogContent` para
            todos los dialogos. Este fue el primero que lo necesito y lo
            resolvio por su cuenta con `max-h-[90dvh]`; dejarlo mantendria dos
            limites distintos para el mismo problema. */}
        <DialogContent className="sm:max-w-3xl">
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

              {/*
                Region permanente (ver `TeamCommissionDialog`). Aqui hace mas
                falta que en ningun otro sitio: la vista previa se pinta con lo
                que se pudo revisar en el navegador y, cuando vuelve la
                comprobacion contra la rifa, estas dos cifras CAMBIAN solas. Sin
                esto, quien no ve la pantalla importaria creyendo otro numero.
              */}
              <div role="status" className="empty:sr-only">
                {descartadas > 0 && importables > 0 ? (
                  <Notice tone="warning" density="compact">
                    Se importarán <strong>{importables}</strong> boletas. Las otras{' '}
                    <strong>{descartadas}</strong> quedarán fuera y las verás marcadas en la tabla
                    de arriba.
                  </Notice>
                ) : null}
              </div>

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
                {/* El verde del sistema, no un `emerald` a mano (D-171). El
                    recuadro se queda como esta: es el paso de resultado de un
                    asistente, no un aviso en linea, y convertirlo en `Notice`
                    seria rediseñarlo sin motivo. */}
                <CheckCircle2Icon
                  className="text-status-success-icon mt-0.5 size-5 shrink-0"
                  aria-hidden
                />
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
