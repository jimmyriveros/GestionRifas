'use client'

import { CheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { MoneyInput } from '@/components/form/MoneyInput'
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import type { CommissionTier } from '@/features/commissions/queries'
import { COMMISSION_MODEL_LABELS, type CommissionModel } from '@/lib/constants'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * Como se le va a pagar a un integrante del equipo (BR-G24, D-127).
 *
 * DOS TARJETAS, UN RADIO DE VERDAD. Se dibujan como tarjetas de precio pero por
 * debajo son un `<fieldset>` con dos `<input type="radio">` reales, no divs con
 * `onClick`. De ahi salen gratis las flechas del teclado, el `Tab` que entra al
 * grupo una sola vez, el anuncio de «2 de 2» de los lectores de pantalla y el
 * envio con Enter. Una version con botones lo habria tenido que reimplementar
 * todo a mano y peor.
 *
 * LA ELECCION NO SE MARCA SOLO CON COLOR (CLAUDE.md §27): la tarjeta elegida
 * lleva ademas un visto, borde grueso y `aria-checked` real. El hueco del visto
 * se reserva siempre para que elegir no desplace el texto de la otra —el mismo
 * criterio de `OptionList`—.
 *
 * LOS TRAMOS NO ESTAN ESCRITOS AQUI. Llegan por props desde `commission_tiers`
 * (BR-G03): el negocio puede cambiarlos sin desplegar, y una tarjeta que
 * prometiera «$20.000» mientras la base de datos paga otra cosa seria peor que
 * no decir nada.
 *
 * EL CAMPO DE LA CIFRA SOLO EXISTE CON LA SEGUNDA TARJETA. No se deshabilita: se
 * quita. Un campo deshabilitado que aparece y desaparece de la ruta del `Tab`
 * confunde mas que un campo que sencillamente no esta mientras no aplica.
 */
export function CommissionModelField({
  value,
  onChange,
  amount,
  onAmountChange,
  amountRef,
  tiers,
  maxFixed,
  disabled = false,
  error,
}: {
  value: CommissionModel
  onChange: (value: CommissionModel) => void
  amount: number | null
  onAmountChange: (value: number | null) => void
  amountRef?: React.Ref<HTMLInputElement>
  tiers: CommissionTier[]
  /** La mitad del precio de la rifa. `null` si no hay ninguna rifa (BR-G23). */
  maxFixed: number | null
  disabled?: boolean
  /** Mensaje de validacion del importe, si lo hay. */
  error?: string
}) {
  const isFixed = value === 'fixed_per_ticket'

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="mb-2 text-sm leading-none font-medium">Cómo le vas a pagar</legend>

      <div className="grid gap-3 sm:grid-cols-2">
        <ModelCard
          name="commissionModel"
          selected={value === 'tiered'}
          onSelect={() => onChange('tiered')}
          title={COMMISSION_MODEL_LABELS.tiered}
          description="Gana más por cada boleta a medida que cobra más. Al subir de tramo, el valor nuevo se aplica a todas las boletas que ya cobró en la rifa."
        >
          <TierTable tiers={tiers} />
        </ModelCard>

        <ModelCard
          name="commissionModel"
          selected={isFixed}
          onSelect={() => onChange('fixed_per_ticket')}
          title={COMMISSION_MODEL_LABELS.fixed_per_ticket}
          description="Tú defines un valor. Gana esa misma cantidad por cada boleta que cobre completa, venda las que venda."
        />
      </div>

      {/*
        La consecuencia va aqui abajo y no dentro de una tarjeta: vale para las
        dos. Es lo unico que quien elige no puede deducir mirando la pantalla, y
        es exactamente el cambio que pidio el dueño (D-127).
      */}
      <p className="text-muted-foreground text-sm">
        Su ganancia sale de la tuya: de cada boleta que cobre tu equipo, tú recibes lo que quede
        después de pagarle.
      </p>

      {isFixed ? (
        <FormItem>
          <FormLabel>Ganancia por boleta</FormLabel>
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
            {maxFixed === null ? (
              <>Ejemplo: si escribes $30.000, ganará $30.000 por cada boleta que cobre completa.</>
            ) : (
              <>
                Ejemplo: si escribes {formatCOP(30_000)}, ganará {formatCOP(30_000)} por cada boleta
                que cobre completa. Puedes darle hasta {formatCOP(maxFixed)}, que es lo que ganas tú
                por boleta.
              </>
            )}
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
  children,
}: {
  name: string
  selected: boolean
  onSelect: () => void
  title: string
  description: string
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
        selected ? 'border-primary bg-primary/5' : 'hover:bg-accent bg-muted/40 border-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        {/* El hueco se reserva siempre: elegir no debe mover el texto. */}
        <CheckIcon
          className={cn('text-primary size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
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
        className="sr-only"
        aria-label={title}
      />
    </label>
  )
}

/** Los tramos vigentes, tal como estan configurados hoy (BR-G03). */
function TierTable({ tiers }: { tiers: CommissionTier[] }) {
  if (tiers.length === 0) return null

  return (
    <dl className="mt-1 space-y-1 text-xs">
      {tiers.map((tier, index) => {
        const next = tiers[index + 1]
        const rango = next
          ? `${tier.minTickets} a ${next.minTickets - 1} boletas`
          : `${tier.minTickets} boletas o más`

        return (
          <div key={tier.minTickets} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{rango}</dt>
            <dd className="tabular-nums">{formatCOP(tier.rate)}</dd>
          </div>
        )
      })}
    </dl>
  )
}
