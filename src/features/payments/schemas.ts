import { z } from 'zod'

/**
 * Validacion de pagos y abonos (CLAUDE.md 18, BR-F02..BR-F06).
 *
 * El dinero son PESOS ENTEROS: `int()` no es cosmetico, impide que llegue un
 * decimal desde el navegador (BR-P02).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Selecciona una fecha válida.')

const money = z
  .number({ error: 'Ingresa un valor.' })
  .int('El valor debe ser un número entero de pesos.')
  .positive('El valor debe ser mayor que cero.')
  .max(1_000_000_000, 'El valor es demasiado alto.')

export const paymentMethodSchema = z.enum(['cash', 'transfer', 'other'])

export const paymentAllocationSchema = z.object({
  ticketId: z.uuid('Boleta no válida.'),
  amount: money,
})
export type PaymentAllocationInput = z.infer<typeof paymentAllocationSchema>

export const createPaymentSchema = z
  .object({
    clientId: z.uuid('Selecciona un cliente.'),
    totalAmount: money,
    paymentDate: isoDate,
    paymentMethod: paymentMethodSchema,
    notes: z.string().trim().max(500, 'Las notas no pueden superar 500 caracteres.'),
    allocations: z
      .array(paymentAllocationSchema)
      .min(1, 'Reparte el abono entre al menos una boleta.'),
  })
  // BR-F05: el reparto debe cuadrar EXACTAMENTE con el total. La RPC lo vuelve
  // a comprobar dentro de la transaccion; esto solo adelanta el mensaje.
  .refine(
    (data) => data.allocations.reduce((sum, item) => sum + item.amount, 0) === data.totalAmount,
    {
      message: 'La suma de lo repartido debe ser igual al valor del abono.',
      path: ['allocations'],
    },
  )
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>

export const voidPaymentSchema = z.object({
  paymentId: z.uuid('Pago no válido.'),
  // El mismo minimo que exige `void_payment` en la base de datos.
  reason: z
    .string()
    .trim()
    .min(5, 'Explica el motivo con al menos 5 caracteres.')
    .max(500, 'El motivo no puede superar 500 caracteres.'),
})
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>
