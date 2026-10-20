import { z } from 'zod'

import { DEFAULT_TICKET_PRICE } from '@/lib/constants'
import { NUMBER_GROUPS_MESSAGES } from '@/lib/ticket-number-format'

import { NUMBER_GROUP_FORM_DEFAULTS, numberGroupsIssue } from './number-groups'

/**
 * Unica fuente de validacion de rifas: la usan el formulario del navegador y la
 * Server Action (docs/ARCHITECTURE.md 5). La base de datos vuelve a validar
 * todo con CHECK e indices unicos.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Selecciona una fecha válida.')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Selecciona una fecha válida.')

export const raffleStatusSchema = z.enum(['draft', 'active', 'closed', 'cancelled'])

const raffleFields = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres.')
    .max(120, 'El nombre no puede superar 120 caracteres.'),
  description: z.string().trim().max(1000, 'La descripción no puede superar 1.000 caracteres.'),
  // BR-P02: pesos ENTEROS. Nunca decimales ni punto flotante.
  ticketPrice: z
    .number({ error: 'Ingresa el precio de la boleta.' })
    .int('El precio debe ser un valor entero en pesos.')
    .positive('El precio debe ser mayor que cero.')
    .max(1_000_000_000, 'El precio es demasiado alto.'),
  startDate: isoDate,
  endDate: isoDate,
  allowSellerTicketCreation: z.boolean(),
})

// BR-R07: la rifa no puede terminar antes de empezar.
const datesInOrder = (data: { startDate: string; endDate: string }) =>
  data.endDate >= data.startDate
const datesError = {
  message: 'La fecha de fin no puede ser anterior a la de inicio.',
  path: ['endDate'],
}

/**
 * Los números de cada boleta (D-261): cuántos, sus nombres y sus cifras. Solo
 * se escriben al CREAR la rifa; después no cambian, y la base lo impide aunque
 * alguien los mande (`raffles_guard_number_groups`).
 */
const groupDigits = z.union([z.literal(2), z.literal(3), z.literal(4)], {
  error: NUMBER_GROUPS_MESSAGES.digits,
})

const numberGroupFields = {
  groupCount: z.union([z.literal(1), z.literal(2)], { error: NUMBER_GROUPS_MESSAGES.count }),
  firstGroupName: z.string().trim(),
  firstGroupDigits: groupDigits,
  secondGroupName: z.string().trim(),
  secondGroupDigits: groupDigits,
}

export const createRaffleSchema = raffleFields
  .extend(numberGroupFields)
  .refine(datesInOrder, datesError)
  .superRefine((value, ctx) => {
    const issue = numberGroupsIssue(value)
    if (issue) ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message })
  })
export type CreateRaffleInput = z.infer<typeof createRaffleSchema>

export const updateRaffleSchema = raffleFields
  .extend({ id: z.uuid('Rifa no válida.') })
  .refine(datesInOrder, datesError)
export type UpdateRaffleInput = z.infer<typeof updateRaffleSchema>

export const changeRaffleStatusSchema = z.object({
  id: z.uuid('Rifa no válida.'),
  status: raffleStatusSchema,
})
export type ChangeRaffleStatusInput = z.infer<typeof changeRaffleStatusSchema>

export const raffleFormDefaults: CreateRaffleInput = {
  name: '',
  description: '',
  ticketPrice: DEFAULT_TICKET_PRICE, // BR-R04
  startDate: '',
  endDate: '',
  allowSellerTicketCreation: false,
  ...NUMBER_GROUP_FORM_DEFAULTS,
}
