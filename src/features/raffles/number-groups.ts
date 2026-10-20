import {
  highestNumber,
  lowestNumber,
  NUMBER_GROUPS_MESSAGES,
  numberGroupsProblem,
  type NumberGroupDigits,
  type RaffleNumberFormat,
} from '@/lib/ticket-number-format'

/**
 * Los números de cada boleta en el formulario de la rifa (D-261).
 *
 * TODOS los textos de esa sección, juntos (`UX_COPY_GUIDELINES`, Anexo B). Se
 * dice «número» —«Primer número», «Segundo número»—, que es lo que el dueño ya
 * llama así; «grupo» es la palabra de la documentación, no de la pantalla. Y se
 * dice ANTES de crear lo único que nadie puede deducir mirando el formulario:
 * que después no se cambia.
 */
export const RAFFLE_NUMBER_GROUPS_COPY = {
  legend: 'Números de cada boleta',
  help: 'Así se llamará cada número en las boletas, en el catálogo y en los premios. Después de crear la rifa no se puede cambiar.',
  countLabel: '¿Cuántos números tiene cada boleta?',
  countOption: { 1: 'Uno', 2: 'Dos' } as const,
  groupTitle: { 1: 'Primer número', 2: 'Segundo número' } as const,
  nameLabel: 'Nombre',
  namePlaceholder: { 1: 'Ejemplo: Diario', 2: 'Ejemplo: Semanal' } as const,
  nameHelp: 'Por ejemplo: Diario, Semanal, Mayor, Seco o Número.',
  digitsLabel: 'Cifras',
  digitsOption: (digits: number) =>
    `${digits} cifras (${lowestNumber(digits)} a ${highestNumber(digits)})`,
  readOnlyNote: 'Los números de una rifa no se cambian después de crearla.',
  confirm: {
    title: 'Revisa los números de la boleta',
    intro: (count: 1 | 2) =>
      count === 1 ? 'Cada boleta tendrá un número:' : 'Cada boleta tendrá dos números:',
    consequence:
      'Después de crear la rifa no podrás cambiar cuántos números tiene cada boleta, sus nombres ni sus cifras.',
    confirmLabel: 'Crear rifa',
    pendingLabel: 'Creando...',
    cancelLabel: 'Volver',
  },
} as const

/** Los campos del formulario que dicen los números de la boleta. */
export type NumberGroupFormValues = {
  groupCount: 1 | 2
  firstGroupName: string
  firstGroupDigits: NumberGroupDigits
  secondGroupName: string
  secondGroupDigits: NumberGroupDigits
}

/** Los de la rifa de siempre: lo que trae el formulario al abrirse. */
export const NUMBER_GROUP_FORM_DEFAULTS: NumberGroupFormValues = {
  groupCount: 2,
  firstGroupName: 'Diario',
  firstGroupDigits: 4,
  secondGroupName: 'Semanal',
  secondGroupDigits: 4,
}

/** Lo que se guarda: con un número, el segundo va vacío. */
export function numberGroupsToRow(values: NumberGroupFormValues) {
  const single = values.groupCount === 1
  return {
    number_group_count: values.groupCount,
    first_group_name: values.firstGroupName.trim(),
    first_group_digits: values.firstGroupDigits,
    second_group_name: single ? null : values.secondGroupName.trim(),
    second_group_digits: single ? null : values.secondGroupDigits,
  }
}

/** Del formulario al formato, para el resumen de confirmación. */
export function numberGroupsToFormat(values: NumberGroupFormValues): RaffleNumberFormat {
  const first = {
    slot: 'daily_number' as const,
    name: values.firstGroupName.trim(),
    digits: values.firstGroupDigits,
  }
  if (values.groupCount === 1) return { groups: [first] }
  return {
    groups: [
      first,
      { slot: 'weekly_number', name: values.secondGroupName.trim(), digits: values.secondGroupDigits },
    ],
  }
}

/** Del formato de una rifa que ya existe al formulario (solo lectura). */
export function numberGroupsFromFormat(format: RaffleNumberFormat): NumberGroupFormValues {
  const [first, second] = format.groups
  return {
    groupCount: format.groups.length,
    firstGroupName: first.name,
    firstGroupDigits: first.digits,
    secondGroupName: second?.name ?? '',
    secondGroupDigits: second?.digits ?? 4,
  }
}

/**
 * El primer problema de los números y el CAMPO donde se pinta. La frase es la
 * de la base (`raffle_number_groups_problem`); aquí solo se decide junto a qué
 * campo se escribe.
 */
export function numberGroupsIssue(
  values: NumberGroupFormValues,
): { path: keyof NumberGroupFormValues; message: string } | null {
  const row = numberGroupsToRow(values)
  const message = numberGroupsProblem({
    count: row.number_group_count,
    firstName: row.first_group_name,
    firstDigits: row.first_group_digits,
    secondName: row.second_group_name,
    secondDigits: row.second_group_digits,
  })
  if (message === null) return null

  const firstAlone = numberGroupsProblem({
    count: 1,
    firstName: row.first_group_name,
    firstDigits: row.first_group_digits,
    secondName: null,
    secondDigits: null,
  })
  if (firstAlone !== null) {
    const path = firstAlone === NUMBER_GROUPS_MESSAGES.digits ? 'firstGroupDigits' : 'firstGroupName'
    return { path, message: firstAlone }
  }
  const path = message === NUMBER_GROUPS_MESSAGES.digits ? 'secondGroupDigits' : 'secondGroupName'
  return { path, message }
}

/**
 * Las boletas que ya existían y no tienen el formato de su rifa (D-261). Solo
 * las ve el personal, en la ficha de la rifa: se dice qué pasa, qué impide y
 * cómo se sale, con las acciones de siempre.
 */
export const NONCONFORMING_COPY = {
  title: 'Boletas sin el formato de esta rifa',
  body: (count: number) =>
    `${count === 1 ? 'Hay 1 boleta cuyos números' : `Hay ${count} boletas cuyos números`} no tienen las cifras de esta rifa. Se crearon antes de que la rifa tuviera sus números definidos y no se cambiaron: no se pueden aprobar ni vender hasta que se corrijan.`,
  action: 'Abre cada una para corregir sus números o, si nunca se vendió, eliminarla.',
  more: (shown: number, total: number) => `Se muestran ${shown} de ${total}.`,
} as const
