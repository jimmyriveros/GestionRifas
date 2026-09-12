import { z } from 'zod'

import { PHONE_REGEX } from '@/lib/constants'

import { PAYMENT_ACCOUNT_MAX } from './accounts'

/**
 * Validacion de una cuenta para recibir pagos (BR-M04, D-185).
 *
 * Capa de cliente Y de servidor, como el resto de `schemas.ts` del proyecto. La
 * tercera capa es el CHECK `seller_payment_accounts_shape_by_kind` de la
 * migracion `0051`, que es el que manda: aqui se repite para poder dar el
 * mensaje antes de ir al servidor.
 *
 * NO HAY CAMPO DE VENDEDOR, y no es un olvido: la Server Action lo saca de la
 * sesion y la RPC de `auth.uid()`, asi que no existe ningun identificador que
 * alguien pudiera manipular para escribir la cuenta de otro (BR-M02).
 *
 * ⚠️ `PHONE_REGEX` cuenta CARACTERES y no digitos (I-108). Se reutiliza tal cual
 * —es el mismo patron que `clients.phone` y el mismo CHECK que la `0051`— en vez
 * de inventar aqui uno mas estricto: dos reglas distintas para el mismo dato
 * acabarian aceptando en un formulario lo que el otro rechaza.
 */

/** El numero de una cuenta bancaria: el mismo patron que el CHECK de la 0051. */
const ACCOUNT_NUMBER_REGEX = /^[0-9][0-9 -]{4,29}$/

const accountFields = {
  kind: z.enum(['nequi', 'daviplata', 'bank']),
  holderName: z
    .string()
    .trim()
    .min(2, 'Escribe el nombre del titular.')
    .max(120, 'El nombre del titular es demasiado largo.'),
  phone: z.string().trim(),
  bankName: z.string().trim(),
  accountType: z.enum(['savings', 'checking']).nullable(),
  accountNumber: z.string().trim(),
  label: z.string().trim().max(40, 'El nombre es demasiado largo.'),
}

type AccountValues = {
  kind: 'nequi' | 'daviplata' | 'bank'
  phone: string
  bankName: string
  accountType: 'savings' | 'checking' | null
  accountNumber: string
}

/**
 * Que campos se exigen depende del tipo, igual que el CHECK.
 *
 * Se escribe UNA vez y se aplica al alta y a la edicion, que son el mismo
 * formulario (el patron de `requireAmountForFixed` en `team/schemas.ts`).
 */
function requireFieldsForKind(values: AccountValues, ctx: z.RefinementCtx) {
  if (values.kind === 'bank') {
    if (values.bankName.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['bankName'], message: 'Escribe el nombre del banco.' })
    }
    if (values.accountType === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['accountType'],
        message: 'Elige si la cuenta es de ahorros o corriente.',
      })
    }
    if (!ACCOUNT_NUMBER_REGEX.test(values.accountNumber)) {
      ctx.addIssue({
        code: 'custom',
        path: ['accountNumber'],
        message: 'Ingresa el número de la cuenta tal como aparece en tu banco.',
      })
    }
    return
  }

  if (!PHONE_REGEX.test(values.phone)) {
    ctx.addIssue({
      code: 'custom',
      path: ['phone'],
      message: 'Ingresa un teléfono válido (7 a 20 dígitos).',
    })
  }
}

export const paymentAccountSchema = z.object(accountFields).superRefine(requireFieldsForKind)
export type PaymentAccountInput = z.input<typeof paymentAccountSchema>

/** Corregir una cuenta: los MISMOS campos y el mismo mensaje, mas su id. */
export const updateAccountSchema = z
  .object({ accountId: z.uuid('Cuenta no válida.'), ...accountFields })
  .superRefine(requireFieldsForKind)

export const accountIdSchema = z.object({ accountId: z.uuid('Cuenta no válida.') })

/**
 * Reordenar: la lista COMPLETA de cuentas activas, en el orden deseado.
 *
 * El tope no es decorativo: la RPC exige que el conjunto coincida exactamente
 * con las cuentas activas de quien llama, y no puede haber mas de cinco
 * (BR-M06).
 */
export const reorderAccountsSchema = z.object({
  accountIds: z.array(z.uuid('Cuenta no válida.')).min(1).max(PAYMENT_ACCOUNT_MAX),
})

/** Lo que trae el formulario en blanco. Nequi primero: es el caso normal. */
export const paymentAccountDefaults: PaymentAccountInput = {
  kind: 'nequi',
  holderName: '',
  phone: '',
  bankName: '',
  accountType: null,
  accountNumber: '',
  label: '',
}
