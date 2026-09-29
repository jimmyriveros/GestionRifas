'use client'

import { CheckIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { MoneyInput } from '@/components/form/MoneyInput'
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { EARNINGS_COPY } from '@/features/commissions/copy'
import { COMMISSION_MODEL_LABELS, type CommissionModel } from '@/lib/constants'
import { cn } from '@/lib/utils'

const COPY = EARNINGS_COPY.field

/**
 * «Cómo le vas a pagar»: la eleccion entre ganancia por tramos y ganancia fija
 * (BR-G24, D-127), en las DOS altas y en los DOS cambios de acuerdo (D-237).
 *
 * UN SOLO CAMPO PARA TODOS. Lo usan el alta de un integrante que hace su
 * vendedor padre, el alta de un vendedor que hace el personal y los dialogos de
 * cambio de cada uno. Lo que cambia entre ellos no son las dos tarjetas ni el
 * campo de la cifra, sino tres cosas que se pasan por props:
 *
 *   * `tieredCardContent` — lo que se lee DENTRO de la tarjeta de tramos. El
 *     vendedor padre ve ahi la lista que recibira su integrante.
 *   * `tieredDetails` — lo que aparece DEBAJO de las tarjetas cuando se eligen
 *     tramos. El personal ve ahi la lista y puede personalizarla: un editor no
 *     puede vivir dentro de la tarjeta, que es un `<label>`.
 *   * `note` y `fixedHint` — la consecuencia que no se ve en la pantalla («su
 *     ganancia sale de la tuya») y el tope de la cifra, cuando lo hay.
 *
 * DOS TARJETAS, UN RADIO DE VERDAD. Se dibujan como tarjetas de precio pero por
 * debajo son un `<fieldset>` con dos `<input type="radio">` reales, no divs con
 * `onClick`. De ahi salen gratis las flechas del teclado, el `Tab` que entra al
 * grupo una sola vez, el anuncio de «2 de 2» de los lectores de pantalla y el
 * envio con Enter.
 *
 * LA ELECCION NO SE MARCA SOLO CON COLOR (CLAUDE.md §27): la tarjeta elegida
 * lleva ademas un visto, borde grueso y `aria-checked` real. El hueco del visto
 * se reserva siempre para que elegir no desplace el texto de la otra.
 *
 * UNA TARJETA QUE NO SE PUEDE ELEGIR LO DICE (BR-G28). Si la lista general no
 * cabe en el acuerdo del vendedor padre, la tarjeta de tramos se deshabilita y
 * lleva debajo la frase de la base que explica por que. Ofrecerla para que el
 * disparador la rechace al guardar seria peor.
 *
 * EL CAMPO DE LA CIFRA SOLO EXISTE CON LA SEGUNDA TARJETA. No se deshabilita: se
 * quita.
 */
export function CommissionModelField({
  value,
  onChange,
  amount,
  onAmountChange,
  amountRef,
  tieredCardContent,
  tieredDetails,
  tieredDisabledReason = null,
  note,
  fixedHint = null,
  disabled = false,
  error,
}: {
  /** `null`: ninguna elegida todavia, como quien hoy cobra la mitad (BR-G30). */
  value: CommissionModel | null
  onChange: (value: CommissionModel) => void
  amount: number | null
  onAmountChange: (value: number | null) => void
  amountRef?: React.Ref<HTMLInputElement>
  tieredCardContent?: ReactNode
  tieredDetails?: ReactNode
  /** Por que no se pueden elegir los tramos. `null` si se pueden. */
  tieredDisabledReason?: string | null
  /** La consecuencia que no se ve en la pantalla. `null` si no hay que decir ninguna. */
  note: string | null
  /** El tope de la cifra fija, ya redactado. `null` si no hay tope que decir. */
  fixedHint?: string | null
  disabled?: boolean
  /** Mensaje de validacion del importe, si lo hay. */
  error?: string
}) {
  const isFixed = value === 'fixed_per_ticket'
  const reasonId = useId()
  const tieredBlocked = tieredDisabledReason !== null && value !== 'tiered'

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="mb-2 text-sm leading-none font-medium">{COPY.legend}</legend>

      <div className="grid gap-3 sm:grid-cols-2">
        <ModelCard
          name="commissionModel"
          selected={value === 'tiered'}
          onSelect={() => onChange('tiered')}
          title={COMMISSION_MODEL_LABELS.tiered}
          description={COPY.tieredDescription}
          blocked={tieredBlocked}
          describedBy={tieredBlocked ? reasonId : undefined}
        >
          {tieredCardContent}
        </ModelCard>

        <ModelCard
          name="commissionModel"
          selected={isFixed}
          onSelect={() => onChange('fixed_per_ticket')}
          title={COMMISSION_MODEL_LABELS.fixed_per_ticket}
          description={COPY.fixedDescription}
        />
      </div>

      {/* El motivo va FUERA de la tarjeta, que se atenua al estar apagada: asi
          se lee con todo su contraste. El radio lo anuncia con
          `aria-describedby`. */}
      {tieredBlocked ? (
        <p id={reasonId} className="text-body-small text-pretty">
          {tieredDisabledReason}
        </p>
      ) : null}

      {/* La consecuencia va aqui abajo y no dentro de una tarjeta: vale para
          las dos. Es lo unico que quien elige no puede deducir mirando la
          pantalla (D-127). */}
      {note === null ? null : <p className="text-muted-foreground text-sm">{note}</p>}

      {value === 'tiered' ? tieredDetails : null}

      {isFixed ? (
        <FormItem>
          <FormLabel>{COPY.fixedLabel}</FormLabel>
          <FormControl>
            <MoneyInput
              ref={amountRef}
              value={amount}
              onChange={onAmountChange}
              disabled={disabled}
              aria-invalid={error !== undefined}
            />
          </FormControl>
          <FormDescription>
            {fixedHint === null ? COPY.fixedExample : `${COPY.fixedExample} ${fixedHint}`}
          </FormDescription>
          {error ? <FormMessage>{error}</FormMessage> : null}
        </FormItem>
      ) : null}
    </fieldset>
  )
}

function ModelCard({
  name,
  selected,
  onSelect,
  title,
  description,
  blocked = false,
  describedBy,
  children,
}: {
  name: string
  selected: boolean
  onSelect: () => void
  title: string
  description: string
  /** No se puede elegir: la tarjeta se deshabilita y otro texto dice por que. */
  blocked?: boolean
  describedBy?: string
  children?: ReactNode
}) {
  return (
    <label
      className={cn(
        // Los estados son EXCLUYENTES, nunca acumulables (misma regla que
        // `OptionList`): una tarjeta elegida trae su propio hover y una sin
        // elegir, el suyo. Asi ninguna combinacion puede dejar texto claro
        // sobre fondo claro.
        'relative flex cursor-pointer flex-col gap-2 rounded-lg border-2 p-4 transition-colors',
        'has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-2',
        'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
        selected
          ? 'border-border-brand bg-selection-surface'
          : 'hover:bg-surface-accent bg-muted/40 border-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        {/* El hueco se reserva siempre: elegir no debe mover el texto. */}
        <CheckIcon
          className={cn('text-text-brand size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
          aria-hidden
        />
      </div>

      <span className="text-muted-foreground text-xs">{description}</span>

      {children}

      <input
        type="radio"
        name={name}
        checked={selected}
        onChange={onSelect}
        disabled={blocked}
        className="sr-only"
        aria-label={title}
        aria-describedby={describedBy}
      />
    </label>
  )
}
