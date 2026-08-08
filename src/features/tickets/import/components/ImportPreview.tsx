'use client'

import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
}

/** El estado se dice con TEXTO, no solo con color (CLAUDE.md 27). */
function EstadoBadge({ status }: { status: ImportRowStatus }) {
  const estilos: Record<ImportRowStatus, string> = {
    valid: 'border-emerald-300 text-emerald-900 dark:text-emerald-200',
    duplicate: 'border-amber-300 text-amber-900 dark:text-amber-200',
    taken: 'border-amber-300 text-amber-900 dark:text-amber-200',
    invalid: 'border-rose-300 text-rose-900 dark:text-rose-200',
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
              <strong className="text-foreground">{review.invalid}</strong> con números mal escritos
            </li>
          ) : null}
        </ul>
        {!checked ? (
          <p className="text-muted-foreground text-xs">
            Comprobando cuáles ya existen en la rifa...
          </p>
        ) : null}
      </div>

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
              <th className="h-10 px-3 text-left font-medium">Estado</th>
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
                <td className="px-3 py-2">
                  <EstadoBadge status={row.status} />
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
