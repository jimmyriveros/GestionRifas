'use client'

import { PlusIcon, XIcon } from 'lucide-react'
import type { ChangeEvent } from 'react'

import { MoneyInput } from '@/components/form/MoneyInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { EARNINGS_COPY } from '../copy'
import { TIER_LIMITS, tierProblems, type EditableTier } from '../tiers'

const COPY = EARNINGS_COPY.editor

function ticketsWord(count: number): string {
  return count === 1 ? 'boleta' : 'boletas'
}

/**
 * El «hasta» de una fila MIENTRAS se escribe: el inicio del siguiente menos uno,
 * y el ultimo abierto. Con datos a medias dice lo que se sabe y nada mas.
 */
export function rowRangeText(tiers: readonly EditableTier[], index: number): string {
  const from = tiers[index]?.minTickets ?? null
  if (from === null) return ''
  const isLast = index === tiers.length - 1
  if (isLast) return `${from} ${ticketsWord(from)} ${COPY.orMore}`

  const next = tiers[index + 1]?.minTickets ?? null
  if (next === null || next <= from) return `Desde ${from} ${ticketsWord(from)}`
  if (next - 1 === from) return `${from} ${ticketsWord(from)}`
  return `De ${from} a ${next - 1} boletas`
}

function parseCount(input: string): number | null {
  const digits = input.replace(/[^0-9]/g, '').slice(0, 6)
  return digits === '' ? null : Number.parseInt(digits, 10)
}

/**
 * Escribir una lista de tramos (D-237, BR-G29, BR-G32): la general en
 * «Ganancias de vendedores» y la personalizada de un vendedor en su alta o su
 * cambio. UN solo editor para los dos usos.
 *
 * CONTROLADO: recibe la lista y devuelve la lista entera en cada cambio. Asi lo
 * usan igual un formulario de pagina y el que vive dentro de un dialogo, y el
 * guardado sigue siendo de la lista ENTERA, nunca de un tramo suelto.
 *
 * CADA TRAMO SE LEE ANTES DE ESCRIBIRLO. La primera linea de cada fila dice su
 * rango en palabras —«De 21 a 50 boletas», «51 boletas o más»—, calculado con lo
 * que hay escrito en ese momento: el «hasta» no se escribe, se deriva del tramo
 * siguiente, y verlo cambiar mientras se teclea es lo que enseña la regla sin
 * explicarla. El primer tramo empieza siempre en 1 y no se puede quitar.
 *
 * LOS ERRORES SON LOS DE LA BASE, fila por fila (`tierProblems`), y solo se
 * pintan despues del primer intento de guardar: marcar en rojo un tramo que la
 * persona todavia no termino de escribir es reñirla por algo que no ha hecho.
 *
 * EN EL TELEFONO cada fila se parte en dos lineas —el titulo con su boton de
 * quitar, y los dos campos debajo—; desde `sm` va todo en una. Nunca se
 * desplaza de lado.
 */
export function TierListEditor({
  value,
  onChange,
  idPrefix,
  showErrors,
  disabled = false,
}: {
  value: readonly EditableTier[]
  onChange: (value: EditableTier[]) => void
  /** Para que los `id` no choquen si hay dos editores en la misma pagina. */
  idPrefix: string
  showErrors: boolean
  disabled?: boolean
}) {
  const problems = tierProblems(value)
  const isFull = value.length >= TIER_LIMITS.maxTiers

  function update(index: number, patch: Partial<EditableTier>) {
    onChange(value.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)))
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function add() {
    onChange([...value, { minTickets: null, rate: null }])
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {value.map((tier, index) => {
          const number = index + 1
          const rowError = showErrors ? problems.rows[index] : undefined
          const errorId = `${idPrefix}-tier-${index}-error`
          const hintId = `${idPrefix}-tier-first-hint`
          const range = rowRangeText(value, index)

          return (
            <li
              // El indice ES la identidad de la fila: la lista se reescribe
              // entera en cada cambio y las filas no se reordenan.
              key={index}
              className={cn(
                'flex flex-wrap items-end gap-x-3 gap-y-2 rounded-md border p-3',
                rowError ? 'border-destructive' : null,
              )}
            >
              <div className="order-1 min-w-0 basis-[calc(100%-3.5rem)] self-center sm:basis-auto sm:flex-1">
                <p className="text-body-small font-medium">{COPY.rowLabel(number)}</p>
                {/* Siempre ocupa su linea, aunque este vacia: asi la fila no
                    salta de alto cuando se empieza a escribir. */}
                <p className="text-muted-foreground text-body-small min-h-5 tabular-nums">{range}</p>
              </div>

              <div className="order-3 w-24 space-y-1 sm:order-2">
                <label
                  htmlFor={`${idPrefix}-tier-${index}-from`}
                  className="text-body-small text-muted-foreground block"
                >
                  {COPY.from}
                  <span className="sr-only"> ({COPY.fromHint})</span>
                </label>
                {index === 0 ? (
                  <Input
                    id={`${idPrefix}-tier-${index}-from`}
                    size="touch"
                    value="1"
                    readOnly
                    aria-label={COPY.fromLabel(number)}
                    aria-describedby={hintId}
                    className="bg-muted/50 tabular-nums"
                  />
                ) : (
                  <Input
                    id={`${idPrefix}-tier-${index}-from`}
                    size="touch"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={tier.minTickets === null ? '' : String(tier.minTickets)}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      update(index, { minTickets: parseCount(event.target.value) })
                    }
                    disabled={disabled}
                    aria-label={COPY.fromLabel(number)}
                    aria-invalid={rowError !== undefined}
                    aria-describedby={rowError ? errorId : undefined}
                    className="tabular-nums"
                  />
                )}
              </div>

              <div className="order-4 min-w-32 flex-1 space-y-1 sm:order-3 sm:w-40 sm:flex-none">
                <label
                  htmlFor={`${idPrefix}-tier-${index}-rate`}
                  className="text-body-small text-muted-foreground block"
                >
                  {COPY.rate}
                </label>
                <MoneyInput
                  id={`${idPrefix}-tier-${index}-rate`}
                  size="touch"
                  value={tier.rate}
                  onChange={(rate) => update(index, { rate })}
                  disabled={disabled}
                  placeholder="$0"
                  aria-label={COPY.rateLabel(number)}
                  aria-invalid={rowError !== undefined}
                  aria-describedby={rowError ? errorId : undefined}
                />
              </div>

              <div className="order-2 sm:order-4">
                {index === 0 ? (
                  // El hueco se reserva, del mismo tamaño que el boton de quitar
                  // (`icon-touch`): las filas quedan alineadas.
                  <span className="block size-11 sm:size-9" aria-hidden />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    disabled={disabled}
                    onClick={() => remove(index)}
                  >
                    <XIcon className="size-4" aria-hidden />
                    <span className="sr-only">{COPY.remove(number)}</span>
                  </Button>
                )}
              </div>

              {rowError ? (
                <p id={errorId} className="text-destructive text-body-small order-5 basis-full">
                  {rowError}
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>

      <p id={`${idPrefix}-tier-first-hint`} className="text-muted-foreground text-body-small">
        {COPY.firstFixed}
      </p>

      {showErrors && problems.list ? (
        <p className="text-destructive text-body-small">{problems.list}</p>
      ) : null}

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          disabled={disabled || isFull}
          onClick={add}
        >
          <PlusIcon className="size-4" aria-hidden />
          {COPY.add}
        </Button>
        {/* El tope se dice cuando estorba, no antes (D-188). */}
        {isFull ? <p className="text-muted-foreground text-body-small">{COPY.full}</p> : null}
      </div>
    </div>
  )
}
