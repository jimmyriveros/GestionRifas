'use client'

import { useId } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  NUMBER_GROUP_DIGIT_OPTIONS,
  NUMBER_GROUP_NAME_MAX,
  numberGroupDescription,
  type RaffleNumberFormat,
} from '@/lib/ticket-number-format'

import { RAFFLE_NUMBER_GROUPS_COPY as C } from '../number-groups'
import type { CreateRaffleInput } from '../schemas'

/**
 * «Números de cada boleta» en el formulario de la rifa (D-261).
 *
 * Al CREAR se elige cuántos números tiene cada boleta —uno o dos— y, de cada
 * uno, su nombre y sus cifras exactas. Al EDITAR solo se leen: la estructura es
 * para siempre, y la base lo impide aunque alguien la mande. Las dos caras
 * viven aquí para que el formulario no tenga que saber cuál pinta.
 */
export function RaffleNumberGroupsField({
  disabled,
  readOnlyFormat,
}: {
  disabled: boolean
  /** Con una rifa que ya existe: sus números, sin campos. */
  readOnlyFormat?: RaffleNumberFormat
}) {
  if (readOnlyFormat) {
    return (
      <section className="space-y-2 rounded-lg border p-4" aria-labelledby="raffle-number-groups">
        <h2 id="raffle-number-groups" className="text-body-medium font-medium">
          {C.legend}
        </h2>
        <ul className="space-y-1">
          {readOnlyFormat.groups.map((group) => (
            <li key={group.slot} className="text-body-small">
              {numberGroupDescription(group)}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-body-small">{C.readOnlyNote}</p>
      </section>
    )
  }

  return <EditableGroups disabled={disabled} />
}

function EditableGroups({ disabled }: { disabled: boolean }) {
  const form = useFormContext<CreateRaffleInput>()
  const count = useWatch({ control: form.control, name: 'groupCount' })

  return (
    <fieldset className="space-y-4 rounded-lg border p-4" disabled={disabled}>
      <legend className="text-body-medium px-1 font-medium">{C.legend}</legend>
      <p className="text-muted-foreground text-body-small">{C.help}</p>

      <FormField
        control={form.control}
        name="groupCount"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{C.countLabel}</FormLabel>
            <Select
              value={String(field.value)}
              onValueChange={(value) => field.onChange(Number(value) as 1 | 2)}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger size="touch" className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {([1, 2] as const).map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {C.countOption[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <GroupFields position={1} disabled={disabled} />
      {count === 2 ? <GroupFields position={2} disabled={disabled} /> : null}
    </fieldset>
  )
}

function GroupFields({ position, disabled }: { position: 1 | 2; disabled: boolean }) {
  const form = useFormContext<CreateRaffleInput>()
  const titleId = useId()
  const nameField = position === 1 ? 'firstGroupName' : 'secondGroupName'
  const digitsField = position === 1 ? 'firstGroupDigits' : 'secondGroupDigits'

  // Un grupo con su título: con dos números hay dos «Nombre» y dos «Cifras», y
  // quien escucha la pantalla tiene que oír de cuál son (D-114).
  return (
    <div role="group" aria-labelledby={titleId} className="space-y-3">
      <h3 id={titleId} className="text-body-small font-medium">
        {C.groupTitle[position]}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name={nameField}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{C.nameLabel}</FormLabel>
              <FormControl>
                <Input
                  placeholder={C.namePlaceholder[position]}
                  maxLength={NUMBER_GROUP_NAME_MAX + 10}
                  disabled={disabled}
                  {...field}
                />
              </FormControl>
              {position === 1 ? <FormDescription>{C.nameHelp}</FormDescription> : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={digitsField}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{C.digitsLabel}</FormLabel>
              <Select
                value={String(field.value)}
                onValueChange={(value) => field.onChange(Number(value) as 2 | 3 | 4)}
                disabled={disabled}
              >
                <FormControl>
                  <SelectTrigger size="touch" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {NUMBER_GROUP_DIGIT_OPTIONS.map((digits) => (
                    <SelectItem key={digits} value={String(digits)}>
                      {C.digitsOption(digits)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}
