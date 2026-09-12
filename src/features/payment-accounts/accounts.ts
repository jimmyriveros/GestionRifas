/**
 * Las cuentas donde un vendedor recibe pagos: que forma tienen, como se
 * escriben y TODOS sus textos (BR-M01..BR-M09, D-185, D-188).
 *
 * Vive aparte —igual que `whatsapp/invite.ts`, `clearance-receipt.ts` o
 * `release-ticket.ts`— porque lo necesitan la pantalla de configuracion, el
 * formulario de un recordatorio (para su vista previa) y las pruebas unitarias,
 * que no montan React. Es PURO: no lee la sesion, no consulta la base y no abre
 * nada.
 *
 * TODOS LOS TEXTOS ESTAN AQUI, juntos, por lo mismo que `search/hints.ts` y
 * `notifications/text.ts`: un termino se escribe una sola vez o acaban habiendo
 * tres (`UX_COPY_GUIDELINES`, Anexo B).
 *
 * Esto NO autoriza nada y NO valida nada de verdad: decide que se pinta. La
 * frontera son los CHECK de la migracion `0051` y sus RPC, que vuelven a
 * comprobarlo todo en la base.
 */

import {
  BANK_ACCOUNT_TYPE_LABELS,
  PAYMENT_ACCOUNT_KIND_LABELS,
  type BankAccountType,
  type PaymentAccountKind,
} from '@/lib/constants'

/**
 * El tope, dicho una vez (BR-M06).
 *
 * En la base NO es un contador: es que `sort_order` va de 1 a 5 y es unico por
 * vendedor, asi que no existe una sexta posicion. Aqui se repite el numero solo
 * para poder desactivar el boton y explicarlo ANTES de que la base lo rechace.
 */
export const PAYMENT_ACCOUNT_MAX = 5

/** Una cuenta, tal como sale de `seller_payment_accounts`. */
export type PaymentAccount = {
  id: string
  kind: PaymentAccountKind
  holderName: string
  /** Nequi y Daviplata. `null` en una cuenta bancaria. */
  phone: string | null
  /** Solo cuenta bancaria. */
  bankName: string | null
  accountType: BankAccountType | null
  accountNumber: string | null
  /** Del vendedor, para distinguirla de otra suya. NO viaja al mensaje. */
  label: string | null
  /** 1..5 mientras esta activa; `null` si esta archivada. */
  sortOrder: number | null
  archivedAt: string | null
}

/** Las tres formas, en el orden en que se ofrecen. */
export const PAYMENT_ACCOUNT_KINDS: readonly PaymentAccountKind[] = [
  'nequi',
  'daviplata',
  'bank',
] as const

export const BANK_ACCOUNT_TYPES: readonly BankAccountType[] = ['savings', 'checking'] as const

export function isBankAccount(kind: PaymentAccountKind): boolean {
  return kind === 'bank'
}

/**
 * Como se dice una cuenta: **en el orden en que se dicta por teléfono**
 * (`UX_COPY_GUIDELINES`, Anexo A).
 *
 *   Nequi · 300 123 4567 · Ana Torres
 *   Bancolombia · Ahorros · 123-456-789 · Ana Torres
 *
 * Primero donde, despues el numero, despues de quien es: es como lo dice
 * cualquiera en voz alta y el orden en que el cliente lo va a teclear en su
 * banco. El **nombre para reconocerla** NO entra: es del vendedor.
 *
 * Devuelve las partes sueltas para que la pantalla pueda separarlas y el
 * mensaje pueda unirlas; asi no hay dos formas de escribir lo mismo.
 */
export function accountParts(account: PaymentAccount): string[] {
  if (isBankAccount(account.kind)) {
    return [
      account.bankName ?? PAYMENT_ACCOUNT_KIND_LABELS.bank,
      account.accountType ? BANK_ACCOUNT_TYPE_LABELS[account.accountType] : '',
      account.accountNumber ?? '',
      account.holderName,
    ].filter((part) => part !== '')
  }
  return [
    PAYMENT_ACCOUNT_KIND_LABELS[account.kind],
    account.phone ?? '',
    account.holderName,
  ].filter((part) => part !== '')
}

/** La cuenta en una linea, para el mensaje y para una tarjeta estrecha. */
export function accountLine(account: PaymentAccount): string {
  return accountParts(account).join(' · ')
}

/** Solo las activas, en su orden. Es lo que ve el cliente y lo que se cuenta. */
export function activeAccounts(accounts: PaymentAccount[]): PaymentAccount[] {
  return accounts
    .filter((account) => account.archivedAt === null)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

export function archivedAccounts(accounts: PaymentAccount[]): PaymentAccount[] {
  return accounts.filter((account) => account.archivedAt !== null)
}

export const ACCOUNT_COPY = {
  /** La seccion, dentro de «Configuración». Mismo nombre en la tarjeta y aquí. */
  title: 'Cuentas para recibir pagos',
  description:
    'Guarda dónde te consignan tus clientes. Se agregan solas al final de tus recordatorios de pago.',

  /** El resumen de «Configuración», en una linea. */
  summary: {
    none: 'Todavía no tienes cuentas',
    one: '1 cuenta activa',
    many: (count: number) => `${count} cuentas activas`,
  },

  empty: {
    title: 'Todavía no tienes cuentas para recibir pagos',
    description:
      'Agrega la primera para que tus clientes sepan dónde consignarte sin tener que preguntártelo.',
  },

  /** Lo que abre el formulario. Empieza por la accion (§4 de la guía). */
  add: 'Agregar cuenta',
  /** Cuando ya no caben mas: el boton se apaga y dice por que (D-188). */
  addBlocked: `Ya tienes ${PAYMENT_ACCOUNT_MAX} cuentas activas. Archiva una para agregar otra.`,

  form: {
    createTitle: 'Agregar cuenta para recibir pagos',
    editTitle: 'Editar cuenta',
    /** La pregunta que elige la forma. NO se llama «tipo de cuenta» (Anexo A). */
    kind: '¿Dónde recibes el pago?',
    holder: 'Titular',
    holderHelp: 'El nombre de la persona a la que le van a consignar.',
    holderPlaceholder: 'Ejemplo: María González',
    /** El termino del glosario. La ayuda dice de que numero se trata. */
    phone: 'Teléfono',
    phoneHelp: (kind: PaymentAccountKind) =>
      `El número de tu ${PAYMENT_ACCOUNT_KIND_LABELS[kind]}.`,
    bankName: 'Banco',
    bankPlaceholder: 'Ejemplo: Bancolombia',
    accountType: 'Tipo de cuenta',
    accountNumber: 'Número de cuenta',
    accountNumberHelp: 'Cópialo tal como aparece en tu banco.',
    label: 'Nombre para reconocerla',
    labelHelp: 'Opcional. Solo lo ves tú; no se envía a tus clientes.',
    labelPlaceholder: 'Ejemplo: El Nequi de mi esposa',
    submitCreate: 'Guardar cuenta',
    submitEdit: 'Guardar cambios',
    cancel: 'Cancelar',
  },

  /** Mover una cuenta. Es el orden en que salen en el mensaje. */
  moveUp: 'Subir',
  moveDown: 'Bajar',
  orderHelp: 'Las cuentas se envían en este orden.',

  edit: 'Editar',
  archive: 'Archivar',
  archiveConfirm: {
    title: 'Archivar cuenta',
    description:
      'Dejará de aparecer en tus recordatorios de pago. Puedes volver a usarla cuando quieras.',
    confirm: 'Archivar cuenta',
    pending: 'Archivando...',
  },

  archivedTitle: 'Cuentas archivadas',
  restore: 'Volver a usar',
  restoreBlocked: `Ya tienes ${PAYMENT_ACCOUNT_MAX} cuentas activas. Archiva una para volver a usar esta.`,

  created: 'La cuenta fue agregada.',
  updated: 'Los cambios fueron guardados.',
  archived: 'La cuenta fue archivada.',
  restored: 'La cuenta volvió a tu lista.',
  reordered: 'El orden fue guardado.',
} as const
