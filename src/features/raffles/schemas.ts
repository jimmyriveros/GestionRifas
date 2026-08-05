import { z } from 'zod'

import { DEFAULT_TICKET_PRICE } from '@/lib/constants'

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

export const createRaffleSchema = raffleFields.refine(datesInOrder, datesError)
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
}
