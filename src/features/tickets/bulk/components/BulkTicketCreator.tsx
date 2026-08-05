'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertTriangleIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { TicketNumberInput } from '@/components/form/TicketNumberInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BULK_TICKET_BATCH_SIZE, BULK_TICKET_MAX, BULK_TICKET_MIN } from '@/lib/constants'
import { cn } from '@/lib/utils'

import type { BulkTicketRow } from '../../schemas'
import { bulkCreateTickets, findExistingCombinations } from '../actions'
import { comboKey, countErrors, selectSendableRows, validateBulkRows } from '../duplicates'

type Option = { id: string; label: string }

type BulkTicketCreatorProps = {
  raffles: Option[]
  sellers: Option[]
  defaultRaffleId?: string
  defaultSellerId?: string
}

const ROW_HEIGHT = 68

function emptyRows(count: number): BulkTicketRow[] {
  return Array.from({ length: count }, () => ({ dailyNumber: '', weeklyNumber: '' }))
}

/**
 * Creacion masiva de 1 a 1.000 boletas (CLAUDE.md 15).
 *
 * Decisiones que hacen que 1.000 filas no bloqueen el navegador:
 *   * Virtualizacion: se renderizan ~15 filas, no 1.000 formularios.
 *   * Un unico estado `rows` con actualizacion inmutable por indice, en vez de
 *     1.000 formularios independientes de react-hook-form.
 *   * Guardado en lotes de 100 con progreso visible; cada lote es atomico en la
 *     base de datos y devuelve sus propios conflictos.
 */
export function BulkTicketCreator({
  raffles,
  sellers,
  defaultRaffleId,
  defaultSellerId,
}: BulkTicketCreatorProps) {
  const router = useRouter()
  const [raffleId, setRaffleId] = useState(defaultRaffleId ?? raffles[0]?.id ?? '')
  const [sellerId, setSellerId] = useState(defaultSellerId ?? sellers[0]?.id ?? '')
  const [quantity, setQuantity] = useState(50)
  const [rows, setRows] = useState<BulkTicketRow[]>([])
  const [existingCombos, setExistingCombos] = useState<ReadonlySet<string>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  const scrollRef = useRef<HTMLDivElement>(null)

  const validations = useMemo(
    () => validateBulkRows(rows, { existingCombos }),
    [rows, existingCombos],
  )
  const errorCount = countErrors(validations)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })

  const updateRow = useCallback((index: number, patch: Partial<BulkTicketRow>) => {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    )
  }, [])

  function generate() {
    const safeQuantity = Math.min(Math.max(quantity, BULK_TICKET_MIN), BULK_TICKET_MAX)
    setRows(emptyRows(safeQuantity))
    setExistingCombos(new Set())
    setProgress(null)
  }

  async function checkAgainstDatabase(): Promise<ReadonlySet<string>> {
    const result = await findExistingCombinations(raffleId, rows)
    if ('error' in result) {
      toast.error(result.error)
      return existingCombos
    }
    const found = new Set(result.data)
    setExistingCombos(found)
    return found
  }

  function verify() {
    startTransition(async () => {
      const found = await checkAgainstDatabase()
      toast[found.size === 0 ? 'success' : 'warning'](
        found.size === 0
          ? 'Ninguna combinación existe todavía en la rifa.'
          : `${found.size} combinación(es) ya existen en la rifa.`,
      )
    })
  }

  function save() {
    startTransition(async () => {
      // Capa 1 y 2 de la validacion antes de escribir nada (BR-N10): formato y
      // duplicados dentro del formulario, y contraste con la base de datos.
      const found = await checkAgainstDatabase()
      const freshValidations = validateBulkRows(rows, { existingCombos: found })
      if (countErrors(freshValidations) > 0) {
        toast.error(
          `Corrige las ${countErrors(freshValidations)} fila(s) marcadas antes de guardar.`,
        )
        return
      }

      const sendable = selectSendableRows(rows, freshValidations)
      if (sendable.length === 0) {
        toast.error('No hay filas para guardar.')
        return
      }

      let inserted = 0
      const conflicts = new Set<string>()
      setProgress({ done: 0, total: sendable.length })

      for (let start = 0; start < sendable.length; start += BULK_TICKET_BATCH_SIZE) {
        const batch = sendable.slice(start, start + BULK_TICKET_BATCH_SIZE)
        const result = await bulkCreateTickets({
          raffleId,
          sellerId,
          rows: batch.map(({ row }) => row),
        })

        if ('error' in result) {
          setProgress(null)
          toast.error(
            inserted === 0
              ? result.error
              : `${result.error} Se alcanzaron a crear ${inserted} boletas.`,
          )
          return
        }

        inserted += result.data.inserted
        for (const conflict of result.data.conflicts) conflicts.add(conflict)
        setProgress({
          done: Math.min(start + batch.length, sendable.length),
          total: sendable.length,
        })
      }

      setProgress(null)

      if (conflicts.size === 0) {
        toast.success(`Se crearon ${inserted} boleta(s).`)
        setRows([])
        router.push(`/owner/tickets?raffleId=${raffleId}&sellerId=${sellerId}`)
        router.refresh()
        return
      }

      // Manejo de errores PARCIALES: se conservan solo las filas rechazadas por
      // la base de datos para corregirlas, con su marca de conflicto.
      setRows(rows.filter((row) => conflicts.has(comboKey(row.dailyNumber, row.weeklyNumber))))
      setExistingCombos(conflicts)
      toast.warning(
        `Se crearon ${inserted} boleta(s). Quedaron ${conflicts.size} con la combinación ya usada.`,
      )
      router.refresh()
    })
  }

  const percent = progress ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="bulk-raffle">Rifa</Label>
          <Select value={raffleId} onValueChange={setRaffleId} disabled={isPending}>
            <SelectTrigger id="bulk-raffle" className="w-full">
              <SelectValue placeholder="Selecciona una rifa" />
            </SelectTrigger>
            <SelectContent>
              {raffles.map((raffle) => (
                <SelectItem key={raffle.id} value={raffle.id}>
                  {raffle.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bulk-seller">Vendedor</Label>
          <Select value={sellerId} onValueChange={setSellerId} disabled={isPending}>
            <SelectTrigger id="bulk-seller" className="w-full">
              <SelectValue placeholder="Selecciona un vendedor" />
            </SelectTrigger>
            <SelectContent>
              {sellers.map((seller) => (
                <SelectItem key={seller.id} value={seller.id}>
                  {seller.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bulk-quantity">Cantidad (1 a {BULK_TICKET_MAX})</Label>
          <Input
            id="bulk-quantity"
            type="number"
            inputMode="numeric"
            min={BULK_TICKET_MIN}
            max={BULK_TICKET_MAX}
            value={quantity}
            onChange={(event) => setQuantity(Number.parseInt(event.target.value, 10) || 0)}
            disabled={isPending}
          />
        </div>

        <div className="flex items-end">
          <Button
            type="button"
            onClick={generate}
            disabled={isPending || !raffleId || !sellerId}
            className="w-full"
          >
            Generar filas
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Indica cuantas boletas necesitas y genera las filas. Puedes dejar filas vacias: se guardan
          como borrador para completarlas después.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" aria-live="polite">
              {rows.length} fila(s).{' '}
              {errorCount > 0 ? (
                <span className="text-destructive font-medium">
                  <AlertTriangleIcon className="mr-1 inline size-4" aria-hidden />
                  {errorCount} con error
                </span>
              ) : (
                <span className="text-muted-foreground">Sin errores</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={verify} disabled={isPending}>
                Verificar duplicados
              </Button>
              <Button type="button" onClick={save} disabled={isPending || errorCount > 0}>
                {isPending ? 'Guardando...' : `Guardar ${rows.length} boleta(s)`}
              </Button>
            </div>
          </div>

          {progress ? (
            <div className="space-y-1">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label="Progreso del guardado"
                className="bg-muted h-2 w-full overflow-hidden rounded-full"
              >
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs" aria-live="polite">
                Guardando {progress.done} de {progress.total}...
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border">
            <div className="text-muted-foreground grid grid-cols-[3rem_1fr_1fr] gap-2 border-b px-3 py-2 text-xs font-medium">
              <span>#</span>
              <span>Número diario</span>
              <span>Número semanal</span>
            </div>
            <div ref={scrollRef} className="h-[28rem] overflow-y-auto">
              <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const index = virtualRow.index
                  const row = rows[index]
                  const validation = validations[index]
                  if (!row) return null
                  const rowHasError = Boolean(
                    validation?.dailyError || validation?.weeklyError || validation?.rowError,
                  )

                  return (
                    <div
                      key={virtualRow.key}
                      // measureElement mide la altura real: una fila con
                      // mensaje de error ocupa mas que una sin el, y con altura
                      // fija el texto quedaria cortado.
                      data-index={index}
                      ref={virtualizer.measureElement}
                      className={cn(
                        'absolute top-0 left-0 grid w-full grid-cols-[3rem_1fr_1fr] items-start gap-2 border-b px-3 py-2',
                        rowHasError && 'bg-destructive/5',
                      )}
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <span className="text-muted-foreground pt-2 text-xs tabular-nums">
                        {index + 1}
                      </span>
                      <div>
                        <TicketNumberInput
                          aria-label={`Número diario de la fila ${index + 1}`}
                          aria-invalid={Boolean(validation?.dailyError)}
                          value={row.dailyNumber}
                          onChange={(value) => updateRow(index, { dailyNumber: value })}
                          disabled={isPending}
                        />
                        {validation?.dailyError ? (
                          <p className="text-destructive mt-1 text-xs">{validation.dailyError}</p>
                        ) : null}
                      </div>
                      <div>
                        <TicketNumberInput
                          aria-label={`Número semanal de la fila ${index + 1}`}
                          aria-invalid={Boolean(validation?.weeklyError)}
                          value={row.weeklyNumber}
                          onChange={(value) => updateRow(index, { weeklyNumber: value })}
                          disabled={isPending}
                        />
                        {validation?.weeklyError ? (
                          <p className="text-destructive mt-1 text-xs">{validation.weeklyError}</p>
                        ) : null}
                      </div>
                      {validation?.rowError ? (
                        <p className="text-destructive col-span-3 text-xs">{validation.rowError}</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
