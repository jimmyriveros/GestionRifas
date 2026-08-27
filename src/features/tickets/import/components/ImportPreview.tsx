'use client'

import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TICKET_PAYMENT_STATUS_LABELS } from '@/lib/constants'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

import type { ImportReview, ImportRowStatus, ReviewedRow } from '../review'

/**
 * Vista previa de lo que se va a importar.
 *
 * Orden pensado para un telefono: primero el RESUMEN —que es lo unico que la
 * mayoria necesita leer—, despues el detalle. Y dentro del detalle, la
 * posibilidad de ver solo las filas con problema, que es lo que se busca cuando
 * el resumen dice que algo no cuadra.
 *
 * Nunca se importa nada desde aqui: este componente solo muestra. Confirmar es
 * una decision aparte, en el paso siguiente.
 */

type ImportPreviewProps = {
  review: ImportReview
  /** `false` mientras se comprueba contra la rifa. */
  checked: boolean
}

const ETIQUETAS: Record<ImportRowStatus, string> = {
  valid: 'Válida',
  duplicate: 'Repetida en el archivo',
  taken: 'Ya existe en la rifa',
  invalid: 'No se puede usar',
  'client-conflict': 'Conflicto de cliente',
}

/** El estado se dice con TEXTO, no solo con color (CLAUDE.md 27). */
function EstadoBadge({ status }: { status: ImportRowStatus }) {
  const estilos: Record<ImportRowStatus, string> = {
    valid: 'border-emerald-300 text-emerald-900 dark:text-emerald-200',
    duplicate: 'border-amber-300 text-amber-900 dark:text-amber-200',
    taken: 'border-amber-300 text-amber-900 dark:text-amber-200',
    invalid: 'border-rose-300 text-rose-900 dark:text-rose-200',
    'client-conflict': 'border-rose-300 text-rose-900 dark:text-rose-200',
  }
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', estilos[status])}>
      {ETIQUETAS[status]}
    </Badge>
  )
}

const POR_PAGINA = 50

export function ImportPreview({ review, checked }: ImportPreviewProps) {
  const [soloProblemas, setSoloProblemas] = useState(false)
  const [pagina, setPagina] = useState(0)

  const conProblema = review.total - review.valid

  const visibles: ReviewedRow[] = useMemo(
    () => (soloProblemas ? review.rows.filter((row) => row.status !== 'valid') : review.rows),
    [review.rows, soloProblemas],
  )

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, paginas - 1)
  const enPantalla = visibles.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA)

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border p-4" aria-live="polite">
        <p className="font-medium">
          {review.total === 1 ? '1 boleta encontrada' : `${review.total} boletas encontradas`}
        </p>
        <ul className="text-muted-foreground grid gap-1 text-sm sm:grid-cols-2">
          <li>
            <strong className="text-foreground">{review.valid}</strong> se pueden importar
          </li>
          <li>
            <strong className="text-foreground">{review.withClient}</strong> con cliente ·{' '}
            <strong className="text-foreground">{review.withoutClient}</strong> sin cliente
          </li>
          {review.duplicates > 0 ? (
            <li>
              <strong className="text-foreground">{review.duplicates}</strong> repetidas dentro del
              archivo
            </li>
          ) : null}
          {review.taken > 0 ? (
            <li>
              <strong className="text-foreground">{review.taken}</strong> ya existen en la rifa
            </li>
          ) : null}
          {review.invalid > 0 ? (
            <li>
              <strong className="text-foreground">{review.invalid}</strong> con datos incompletos o
              mal escritos
            </li>
          ) : null}
          {review.clientConflicts > 0 ? (
            <li>
              <strong className="text-foreground">{review.clientConflicts}</strong> con conflicto de
              cliente
            </li>
          ) : null}
          {review.withAbono > 0 ? (
            <li>
              <strong className="text-foreground">{review.withAbono}</strong>{' '}
              {review.withAbono === 1 ? 'abono' : 'abonos'} por{' '}
              <strong className="text-foreground">{formatCOP(review.abonoTotal)}</strong>
            </li>
          ) : null}
        </ul>
        {!checked ? (
          <p className="text-muted-foreground text-xs">
            Comprobando cuáles ya existen en la rifa...
          </p>
        ) : null}
      </div>

      {review.clients.length > 0 ? (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="font-medium">
            {review.clients.length === 1
              ? '1 cliente único detectado'
              : `${review.clients.length} clientes únicos detectados`}
          </p>
          {/* El desglose importa mas que el total: crear un cliente nuevo y
              reutilizar uno que ya existe son dos cosas distintas, y quien
              confirma quiere saber cuantos de cada uno antes de guardar. */}
          <p className="text-muted-foreground text-sm">
            <strong className="text-foreground">{review.clientsNew}</strong>{' '}
            {review.clientsNew === 1 ? 'se creará' : 'se crearán'} ·{' '}
            <strong className="text-foreground">{review.clientsExisting}</strong> ya{' '}
            {review.clientsExisting === 1 ? 'existe' : 'existen'}
          </p>
          <ul className="divide-y text-sm">
            {review.clients.slice(0, 8).map((client) => (
              <li
                key={client.key}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <strong>{client.name}</strong>
                  <span className="text-muted-foreground"> · {client.phone}</span>
                </span>
                <span className="text-muted-foreground">
                  {client.tickets === 1 ? '1 boleta' : `${client.tickets} boletas`} ·{' '}
                  {client.status === 'existing' ? 'Cliente existente' : 'Cliente nuevo'}
                </span>
              </li>
            ))}
          </ul>
          {review.clients.length > 8 ? (
            <p className="text-muted-foreground text-xs">
              Hay {review.clients.length - 8} clientes más en el archivo.
            </p>
          ) : null}
        </div>
      ) : null}

      {conProblema > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={soloProblemas ? 'default' : 'outline'}
            onClick={() => {
              setSoloProblemas((valor) => !valor)
              setPagina(0)
            }}
          >
            {soloProblemas ? 'Ver todas las filas' : `Ver solo las ${conProblema} con problema`}
          </Button>
        </div>
      ) : null}

      <div className="w-full overflow-x-auto rounded-lg border">
        <table className="w-full caption-bottom text-sm">
          <caption className="sr-only">Boletas encontradas en el archivo</caption>
          <thead>
            <tr className="border-b">
              <th className="hidden h-10 px-3 text-left font-medium sm:table-cell">Fila</th>
              <th className="h-10 px-3 text-left font-medium">Premio semanal</th>
              <th className="h-10 px-3 text-left font-medium">Premio diario</th>
              <th className="hidden h-10 px-3 text-left font-medium lg:table-cell">Cliente</th>
              <th className="hidden h-10 px-3 text-left font-medium lg:table-cell">Celular</th>
              <th className="hidden h-10 px-3 text-left font-medium lg:table-cell">Abono</th>
              <th className="hidden h-10 px-3 text-left font-medium xl:table-cell">Estado</th>
              {/* «Resultado» y no «Estado»: en esta tabla conviven el estado en
                  que quedara la boleta y el resultado de revisar la fila, y dos
                  columnas llamadas «Estado» se leen una por la otra. */}
              <th className="h-10 px-3 text-left font-medium">Resultado</th>
              <th className="hidden h-10 px-3 text-left font-medium md:table-cell">Problema</th>
            </tr>
          </thead>
          <tbody>
            {enPantalla.map((row) => (
              <tr
                key={row.rowNumber}
                className={cn('border-b', row.status !== 'valid' && 'bg-destructive/5')}
              >
                <td className="text-muted-foreground hidden px-3 py-2 text-xs tabular-nums sm:table-cell">
                  {row.rowNumber}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums">{row.weeklyNumber || '—'}</td>
                <td className="px-3 py-2 font-mono tabular-nums">{row.dailyNumber || '—'}</td>
                <td className="hidden px-3 py-2 lg:table-cell">{row.clientName || '—'}</td>
                <td className="hidden px-3 py-2 tabular-nums lg:table-cell">
                  {row.clientPhone || '—'}
                </td>
                <td className="hidden px-3 py-2 tabular-nums lg:table-cell">
                  {row.abonoAmount !== undefined ? formatCOP(row.abonoAmount) : '—'}
                </td>
                <td className="text-muted-foreground hidden px-3 py-2 text-xs xl:table-cell">
                  {row.expectedPaymentStatus
                    ? TICKET_PAYMENT_STATUS_LABELS[row.expectedPaymentStatus]
                    : '—'}
                </td>
                <td className="px-3 py-2">
                  <EstadoBadge status={row.status} />
                  {row.clientName || row.clientPhone ? (
                    <p className="text-muted-foreground mt-1 text-xs lg:hidden">
                      {row.clientName || 'Sin nombre'} · {row.clientPhone || 'Sin celular'}
                    </p>
                  ) : null}
                  {/* En pantallas estrechas no hay columnas de abono ni de
                      estado: el dato va debajo, que es donde se mira. */}
                  {row.abonoAmount !== undefined ? (
                    <p className="text-muted-foreground mt-1 text-xs xl:hidden">
                      Abono {formatCOP(row.abonoAmount)}
                      {row.expectedPaymentStatus
                        ? ` · ${TICKET_PAYMENT_STATUS_LABELS[row.expectedPaymentStatus]}`
                        : ''}
                    </p>
                  ) : null}
                  {/* En pantallas estrechas no hay columna «Problema»: el
                      motivo va debajo del estado, que es donde se mira. */}
                  {row.problem ? (
                    <p className="text-muted-foreground mt-1 text-xs md:hidden">{row.problem}</p>
                  ) : null}
                </td>
                <td className="text-muted-foreground hidden px-3 py-2 text-xs md:table-cell">
                  {row.problem}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginas > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs" aria-live="polite">
            Mostrando {paginaActual * POR_PAGINA + 1}–
            {Math.min((paginaActual + 1) * POR_PAGINA, visibles.length)} de {visibles.length}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={paginaActual === 0}
              onClick={() => setPagina(paginaActual - 1)}
            >
              Anterior
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={paginaActual >= paginas - 1}
              onClick={() => setPagina(paginaActual + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
