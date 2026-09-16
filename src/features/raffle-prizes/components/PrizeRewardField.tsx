'use client'

import { ChevronDownIcon, ChevronUpIcon, PlusIcon, XIcon } from 'lucide-react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'

import { MoneyInput } from '@/components/form/MoneyInput'
import { Button } from '@/components/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  PRIZE_FORM_COPY,
  PRIZE_REWARD_MODE_LABELS,
  PRIZE_REWARD_MODE_VALUES,
  rewardText,
} from '../copy'
import { PRIZE_LIMITS, type PrizeFormInput } from '../schemas'

/**
 * La recompensa de un premio: una sola, o varias alternativas excluyentes
 * (BR-J02, D-201).
 *
 * EL MODO SE ELIGE, NO SE DEDUCE. Pasar a «Alternativas a elegir» agrega la
 * segunda alternativa en el acto, y volver a «Premio único» se queda con la
 * primera: así el formulario nunca queda en un estado que la base va a
 * rechazar, y la persona ve lo que va a pasar antes de guardar.
 *
 * La vista previa es lo que convierte la promesa en algo comprobable: la frase
 * que se lee aquí es la misma que verá quien consulte el premio.
 */
export function PrizeRewardField({ disabled }: { disabled?: boolean }) {
  const form = useFormContext<PrizeFormInput>()
  const { control } = form

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'reward.options',
  })

  const reward = useWatch({ control, name: 'reward' })
  const mode = reward?.mode ?? 'fixed'
  const options = reward?.options ?? []
  const isChoice = mode === 'winner_choice'
  const isFull = fields.length >= PRIZE_LIMITS.rewardOptionsMax

  function changeMode(next: string) {
    const value = next as (typeof PRIZE_REWARD_MODE_VALUES)[number]
    form.setValue('reward.mode', value, { shouldDirty: true })

    // Un «Premio único» lleva exactamente una alternativa y una elección, al
    // menos dos: el formulario ajusta la lista en vez de dejarla inconsistente.
    if (value === 'fixed') {
      // De una sola vez y con la lista de indices: quitarlas una a una
      // reindexaria el array entre llamadas.
      const sobrantes = fields.map((_, index) => index).slice(1)
      if (sobrantes.length > 0) remove(sobrantes)
      return
    }
    if (fields.length < 2) append({ description: null, amount: null })
  }

  return (
    <fieldset className="space-y-4 rounded-lg border p-4" disabled={disabled}>
      <legend className="text-body-medium px-1 font-medium">{PRIZE_FORM_COPY.rewardLegend}</legend>

      <FormField
        control={form.control}
        name="reward.mode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{PRIZE_FORM_COPY.rewardModeLabel}</FormLabel>
            <Select value={field.value} onValueChange={changeMode} disabled={disabled}>
              <FormControl>
                <SelectTrigger size="touch" className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {PRIZE_REWARD_MODE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {PRIZE_REWARD_MODE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-3">
        {isChoice ? (
          <p className="text-muted-foreground text-body-small">{PRIZE_FORM_COPY.optionsHelp}</p>
        ) : null}

        {fields.map((field, index) => (
          <div key={field.id} className="space-y-3 rounded-md border p-3">
            {isChoice ? (
              // A 320 px el título y los tres botones de 44 px no caben en una
              // fila: se parte en dos en vez de ensanchar el diálogo, que se
              // desplazaba de lado (D-202). Los botones siguen a la derecha.
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <p className="text-body-small font-medium">
                  {PRIZE_FORM_COPY.optionTitle(index + 1)}
                </p>
                <div className="ms-auto flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <ChevronUpIcon className="size-4" aria-hidden />
                    <span className="sr-only">{`${PRIZE_FORM_COPY.optionUp} ${index + 1}`}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    disabled={disabled || index === fields.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ChevronDownIcon className="size-4" aria-hidden />
                    <span className="sr-only">{`${PRIZE_FORM_COPY.optionDown} ${index + 1}`}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    disabled={disabled || fields.length <= 2}
                    onClick={() => remove(index)}
                  >
                    <XIcon className="size-4" aria-hidden />
                    <span className="sr-only">{`${PRIZE_FORM_COPY.removeOption} ${index + 1}`}</span>
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name={`reward.options.${index}.description`}
                render={({ field: option }) => (
                  <FormItem>
                    <FormLabel>{PRIZE_FORM_COPY.optionDescriptionLabel}</FormLabel>
                    <FormControl>
                      <Input
                        size="touch"
                        placeholder={PRIZE_FORM_COPY.optionDescriptionPlaceholder}
                        value={option.value ?? ''}
                        onChange={(event) =>
                          option.onChange(event.target.value === '' ? null : event.target.value)
                        }
                        onBlur={option.onBlur}
                        name={option.name}
                        disabled={disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`reward.options.${index}.amount`}
                render={({ field: option }) => (
                  <FormItem>
                    <FormLabel>{PRIZE_FORM_COPY.optionAmountLabel}</FormLabel>
                    <FormControl>
                      <MoneyInput
                        size="touch"
                        value={option.value ?? null}
                        onChange={(value) => option.onChange(value)}
                        onBlur={option.onBlur}
                        name={option.name}
                        disabled={disabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <p className="text-muted-foreground text-body-small">{PRIZE_FORM_COPY.optionHelp}</p>
          </div>
        ))}

        {isChoice ? (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={disabled || isFull}
              onClick={() => append({ description: null, amount: null })}
            >
              <PlusIcon className="size-4" aria-hidden />
              {PRIZE_FORM_COPY.addOption}
            </Button>
            {/* El tope se dice cuando estorba, no antes (D-188). */}
            {isFull ? (
              <p className="text-muted-foreground text-body-small">{PRIZE_FORM_COPY.optionsMax}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* La vista previa: lo que se lee es lo que se guarda. */}
      <div className="bg-muted/50 rounded-md px-3 py-2">
        <p className="text-muted-foreground text-body-small">{PRIZE_FORM_COPY.rewardPreview}</p>
        <p className="text-body-small text-pretty">
          {rewardText({
            mode,
            options: options.map((option) => ({
              description: option?.description ?? null,
              amount: option?.amount ?? null,
            })),
          }) || '—'}
        </p>
      </div>
    </fieldset>
  )
}
