/**
 * Las cuentas donde un vendedor recibe pagos: que forma tienen, como se
 * escriben y TODOS sus textos (BR-M01..BR-M10, D-185, D-188, D-209).
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
 * frontera son los CHECK de las migraciones `0051` y `0074` y sus RPC, que
 * vuelven a comprobarlo todo en la base.
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
  /** Nequi y Daviplata. `null` en las demas. */
  phone: string | null
  /** Solo cuenta bancaria. */
  bankName: string | null
  accountType: BankAccountType | null
  accountNumber: string | null
  /**
   * Bre-B y «Otros»: la llave o el numero, TAL COMO SE ESCRIBIO —mayusculas,
   * ceros iniciales y simbolos incluidos— y sin espacios exteriores (BR-M10).
   * `null` en las demas.
   */
  identifier: string | null
  /** Del vendedor, para distinguirla de otra suya. NO viaja al mensaje. */
  label: string | null
  /** 1..5 mientras esta activa; `null` si esta archivada. */
  sortOrder: number | null
  archivedAt: string | null
}

/** Las cinco formas, en el orden en que se ofrecen (D-209: las dos nuevas, al final). */
export const PAYMENT_ACCOUNT_KINDS: readonly PaymentAccountKind[] = [
  'nequi',
  'daviplata',
  'bank',
  'breb',
  'other',
] as const

export const BANK_ACCOUNT_TYPES: readonly BankAccountType[] = ['savings', 'checking'] as const

/**
 * Que datos lleva una cuenta, segun su forma (BR-M04). Es el mismo reparto que
 * el CHECK `seller_payment_accounts_shape_by_kind` de la `0074`:
 *
 *   phone       Nequi y Daviplata: un telefono, con `PhoneInput`.
 *   bank        cuenta bancaria: banco, tipo y numero.
 *   identifier  Bre-B y «Otros»: un texto libre de una linea (BR-M10).
 *
 * Sin `default` a proposito: una forma que alguien anada manana y no decida
 * aqui su rama no compila, igual que en la base cae en `else false`.
 */
export type PaymentAccountShape = 'phone' | 'bank' | 'identifier'

export function accountShape(kind: PaymentAccountKind): PaymentAccountShape {
  switch (kind) {
    case 'nequi':
    case 'daviplata':
      return 'phone'
    case 'bank':
      return 'bank'
    case 'breb':
    case 'other':
      return 'identifier'
  }
}

export function isBankAccount(kind: PaymentAccountKind): boolean {
  return accountShape(kind) === 'bank'
}

/** Las dos formas que se identifican con un texto libre (BR-M10). */
export type IdentifierAccountKind = Extract<PaymentAccountKind, 'breb' | 'other'>

export function isIdentifierKind(kind: PaymentAccountKind): kind is IdentifierAccountKind {
  return accountShape(kind) === 'identifier'
}

/**
 * El largo maximo de una llave o un identificador, en caracteres (BR-M10,
 * D-209). La `0074` dice el mismo numero en `payment_account_identifier_problem`.
 *
 * Por que 100: cabe cualquier llave de Bre-B —un telefono, un documento, una
 * llave como «@maria» o un correo— y los identificadores largos de otras formas
 * que se ven en la practica, y la linea del mensaje sigue siendo una linea que
 * se lee en un telefono.
 */
export const PAYMENT_ACCOUNT_IDENTIFIER_MAX = 100

/**
 * Lo que NO puede aparecer en una llave o un identificador (BR-M10): puntos de
 * codigo, en rangos cerrados.
 *
 * Se escriben como NUMEROS y no como una expresion regular para que no haya un
 * solo caracter invisible en este archivo. Son exactamente los rangos de la
 * clase de la `0074`, y una prueba de base recorre la BMP entera comparando los
 * dos veredictos, punto de codigo por punto de codigo.
 */
export const IDENTIFIER_FORBIDDEN_RANGES: ReadonlyArray<readonly [number, number]> = [
  // Control C0: entre otros, el tabulador y el salto de linea.
  [0x0000, 0x001f],
  // DEL y control C1.
  [0x007f, 0x009f],
  // Guion discrecional: no se ve.
  [0x00ad, 0x00ad],
  // Anchura cero y marcas de direccion.
  [0x200b, 0x200f],
  // Separadores de linea y de parrafo, e incrustaciones de direccion.
  [0x2028, 0x202e],
  // Union de palabras, operadores invisibles y aislamientos de direccion.
  [0x2060, 0x206f],
  // Marca de orden de bytes (espacio sin corte de anchura cero).
  [0xfeff, 0xfeff],
]

function hasForbiddenCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (IDENTIFIER_FORBIDDEN_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to)) {
      return true
    }
  }
  return false
}

/**
 * Por que una llave o un identificador no vale, en la frase que lee el vendedor;
 * `null` si vale (BR-M10).
 *
 * Recibe el texto YA RECORTADO —`.trim()` de Zod, que es `String.prototype.trim()`
 * y quita exactamente lo mismo que `payment_account_identifier_trim` de la
 * `0074`—. Es el espejo de `payment_account_identifier_problem`: las mismas tres
 * comprobaciones, en el mismo orden y con las MISMAS frases, que una prueba
 * busca letra por letra en la migracion.
 *
 * El largo se cuenta en puntos de codigo (`[...texto]`), como `char_length` de
 * PostgreSQL: `.length` contaria dos por un emoji y los dos lados no dirian lo
 * mismo.
 *
 * Para Nequi, Daviplata y banco devuelve `null`, como la funcion de la base:
 * ahi no hay identificador que juzgar.
 */
export function identifierProblem(kind: PaymentAccountKind, value: string): string | null {
  if (!isIdentifierKind(kind)) return null
  const errors = ACCOUNT_COPY.form.identifier[kind].errors
  if (value === '') return errors.required
  if ([...value].length > PAYMENT_ACCOUNT_IDENTIFIER_MAX) return errors.tooLong
  if (hasForbiddenCharacter(value)) return errors.invisible
  return null
}

/**
 * Como se dice una cuenta: **en el orden en que se dicta por teléfono**
 * (`UX_COPY_GUIDELINES`, Anexo A).
 *
 *   Nequi · 300 123 4567 · Ana Torres
 *   Bancolombia · Ahorros · 123-456-789 · Ana Torres
 *   Bre-B · @maria · Ana Torres
 *   Otros · 0012-ABC · Ana Torres
 *
 * Primero donde, despues el numero, despues de quien es: es como lo dice
 * cualquiera en voz alta y el orden en que el cliente lo va a teclear en su
 * banco. El **nombre para reconocerla** NO entra: es del vendedor.
 *
 * La llave y el identificador salen TAL CUAL se guardaron: sin formato, sin
 * «@» anadido y sin cambiar una mayuscula (BR-M10). Son lo que el cliente va a
 * copiar.
 *
 * Devuelve las partes sueltas para que la pantalla pueda separarlas y el
 * mensaje pueda unirlas; asi no hay dos formas de escribir lo mismo.
 */
export function accountParts(account: PaymentAccount): string[] {
  const shape = accountShape(account.kind)
  if (shape === 'bank') {
    return [
      account.bankName ?? PAYMENT_ACCOUNT_KIND_LABELS.bank,
      account.accountType ? BANK_ACCOUNT_TYPE_LABELS[account.accountType] : '',
      account.accountNumber ?? '',
      account.holderName,
    ].filter((part) => part !== '')
  }
  return [
    PAYMENT_ACCOUNT_KIND_LABELS[account.kind],
    (shape === 'identifier' ? account.identifier : account.phone) ?? '',
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
    phoneHelp: (kind: Extract<PaymentAccountKind, 'nequi' | 'daviplata'>) =>
      `El número de tu ${PAYMENT_ACCOUNT_KIND_LABELS[kind]}.`,
    /**
     * Bre-B y «Otros» (BR-M10, D-209). Las dos etiquetas son las que pidio el
     * dueño del producto. Las frases de error son las MISMAS que levanta
     * `payment_account_identifier_problem` de la `0074`: una prueba las busca
     * ahi letra por letra, porque quien las lea dos veces no tiene por que
     * entender que son dos sistemas (la regla de D-188 para el tope).
     */
    identifier: {
      breb: {
        label: 'Tu llave',
        // «Llave» es nueva para mucha gente: se explica con los tres casos que
        // mas se ven, y ninguno obliga al «@» (no se exige ni se anade).
        help: 'Cópiala tal como aparece en tu banco: puede ser tu teléfono, tu correo o una llave como @maria.',
        errors: {
          required: 'Escribe tu llave.',
          tooLong: 'La llave es demasiado larga. Usa 100 caracteres como máximo.',
          invisible:
            'La llave tiene saltos de línea o caracteres invisibles. Escríbela de nuevo en una sola línea.',
        },
      },
      other: {
        label: 'Número o identificador',
        help: 'Escríbelo tal como lo deben usar tus clientes para pagarte.',
        errors: {
          required: 'Escribe el número o identificador.',
          tooLong: 'El número o identificador es demasiado largo. Usa 100 caracteres como máximo.',
          invisible:
            'El número o identificador tiene saltos de línea o caracteres invisibles. Escríbelo de nuevo en una sola línea.',
        },
      },
    },
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
