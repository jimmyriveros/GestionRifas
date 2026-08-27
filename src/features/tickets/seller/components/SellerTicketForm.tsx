'use client'

import { AlertTriangleIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
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
import { SELLER_TICKET_MAX } from '@/lib/constants'
import { cn } from '@/lib/utils'

import { comboKey, countErrors, validateBulkRows } from '../../bulk/duplicates'
import { TicketImportDialog } from '../../import/components/TicketImportDialog'
import { createSellerTickets } from '../actions'
import type { SellerTicketRow } from '../schemas'

type SellerTicketFormProps = {
  raffles: { id: string; label: string; ticketPrice: number }[]
}

function emptyRows(count: number): SellerTicketRow[] {
  return Array.from({ length: count }, () => ({ dailyNumber: '', weeklyNumber: '' }))
}

/**
 * Creacion de boletas por el vendedor. Mismo motor de validacion por fila que
 * la carga masiva del personal (`validateBulkRows`), pero exigiendo los dos
 * numeros: una boleta pendiente de aprobacion no puede quedar incompleta.
 *
 * Sin virtualizacion a proposito: el limite son 100 filas (D-049), muy por
 * debajo de lo que justifica ese aparato.
 */
export function SellerTicketForm({ raffles }: SellerTicketFormProps) {
  const router = useRouter()
  const [raffleId, setRaffleId] = useState(raffles[0]?.id ?? '')
  const [quantity, setQuantity] = useState(5)
  const [rows, setRows] = useState<SellerTicketRow[]>(emptyRows(5))
  const [takenCombos, setTakenCombos] = useState<ReadonlySet<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const validations = useMemo(
    () => validateBulkRows(rows, { requireComplete: true, existingCombos: takenCombos }),
    [rows, takenCombos],
  )
  const errorCount = countErrors(validations)

  function updateRow(index: number, patch: Partial<SellerTicketRow>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    )
  }

  function generate() {
    const safe = Math.min(Math.max(quantity, 1), SELLER_TICKET_MAX)
    setRows(emptyRows(safe))
    setTakenCombos(new Set())
  }

  function save() {
    if (errorCount > 0) {
      toast.error(`Corrige las ${errorCount} fila(s) marcadas antes de guardar.`)
      return
    }

    startTransition(async () => {
      const result = await createSellerTickets({ raffleId, rows })

      if ('error' in result) {
        toast.error(result.error)
        return
      }

      const { inserted, conflicts } = result.data

      if (conflicts.length === 0) {
        toast.success(
          inserted === 1
            ? 'Boleta creada. Queda pendiente de aprobación.'
            : `${inserted} boletas creadas. Quedan pendientes de aprobación.`,
        )
        router.push('/seller/tickets?inventoryStatus=pending_approval')
        router.refresh()
        return
      }

      // Errores parciales: se conservan solo las filas rechazadas, marcadas.
      const conflictSet = new Set(conflicts)
      setRows(rows.filter((row) => conflictSet.has(comboKey(row.dailyNumber, row.weeklyNumber))))
      setTakenCombos(conflictSet)
      toast.warning(
        `Se crearon ${inserted} boleta(s). ${conflicts.length} combinación(es) ya estaban tomadas en la rifa.`,
      )
      router.refresh()
    })
  }

  if (raffles.length === 0) return null

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="seller-raffle">Rifa</Label>
          <Select value={raffleId} onValueChange={setRaffleId} disabled={isPending}>
            <SelectTrigger id="seller-raffle" className="w-full">
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
          <Label htmlFor="seller-quantity">Cuantas (1 a {SELLER_TICKET_MAX})</Label>
          <div className="flex gap-2">
            <Input
              id="seller-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={SELLER_TICKET_MAX}
              value={quantity}
              onChange={(event) => setQuantity(Number.parseInt(event.target.value, 10) || 0)}
              disabled={isPending}
            />
            <Button type="button" variant="secondary" onClick={generate} disabled={isPending}>
              Generar
            </Button>
          </div>
        </div>
      </div>

      {/* La misma pantalla, la otra forma de llenarla: subir el archivo. La
          rifa sale del selector de arriba y el vendedor, de la sesion: el
          archivo solo lleva los dos números (BR-N12). */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
        <p className="text-muted-foreground text-sm">
          ¿Ya tienes las boletas en un archivo? Súbelo y las revisamos antes de guardar.
        </p>
        <TicketImportDialog
          raffleId={raffleId}
          ticketPrice={raffles.find((raffle) => raffle.id === raffleId)?.ticketPrice ?? 0}
          disabled={isPending || !raffleId}
          successHref="/seller/tickets?inventoryStatus=pending_approval"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" aria-live="polite">
          {rows.length} boleta(s).{' '}
          {errorCount > 0 ? (
            <span className="text-destructive font-medium">
              <AlertTriangleIcon className="mr-1 inline size-4" aria-hidden />
              {errorCount} con error
            </span>
          ) : (
            <span className="text-muted-foreground">Sin errores</span>
          )}
        </p>
        <Button type="button" onClick={save} disabled={isPending || errorCount > 0 || !raffleId}>
          {isPending ? 'Guardando...' : `Crear ${rows.length} boleta(s)`}
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="text-muted-foreground grid grid-cols-[2.5rem_1fr_1fr] gap-2 border-b px-3 py-2 text-xs font-medium">
          <span>#</span>
          <span>Número diario</span>
          <span>Número semanal</span>
        </div>

        <ul className="divide-y">
          {rows.map((row, index) => {
            const validation = validations[index]
            const rowHasError = Boolean(
              validation?.dailyError || validation?.weeklyError || validation?.rowError,
            )
            return (
              <li
                key={index}
                className={cn(
                  'grid grid-cols-[2.5rem_1fr_1fr] items-start gap-2 px-3 py-2',
                  rowHasError && 'bg-destructive/5',
                )}
              >
                <span className="text-muted-foreground pt-2 text-xs tabular-nums">{index + 1}</span>
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
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
