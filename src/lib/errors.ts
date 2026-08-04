/**
 * Traduce errores de Postgres/Supabase a mensajes en espanol seguros para
 * mostrar al usuario, sin exponer detalles internos (docs/SECURITY.md T14).
 */

type PgLikeError = {
  code?: string | null
  message?: string | null
}

const PG_ERROR_MESSAGES: Record<string, string> = {
  '23505': 'Ya existe un registro con estos datos.',
  '23503': 'El registro relacionado no existe o no tienes acceso a el.',
  '23514': 'Los datos no cumplen las reglas del sistema.',
  '42501': 'No tienes permiso para realizar esta accion.',
  '22P02': 'Uno de los valores enviados no tiene el formato esperado.',
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Correo o contrasena incorrectos.',
  email_not_confirmed: 'Debes confirmar tu correo antes de ingresar.',
  user_not_found: 'No existe una cuenta con ese correo.',
  weak_password: 'La contrasena no cumple los requisitos minimos de seguridad.',
  same_password: 'La nueva contrasena debe ser diferente a la actual.',
  over_request_rate_limit: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
  email_exists: 'Ya existe una cuenta con ese correo.',
  email_address_invalid: 'El correo electronico no es valido.',
}

/**
 * Restricciones cuya violacion tiene un significado de negocio concreto. El
 * mensaje que produce PostgreSQL menciona tablas y columnas ("violates unique
 * constraint \"tickets_combo_unique\""), asi que nunca se muestra tal cual:
 * se traduce por nombre de restriccion (D-044).
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  tickets_combo_unique:
    'Ya existe una boleta con esa combinacion de numero diario y semanal en esta rifa.',
  tickets_org_internal_code_key: 'Ya existe una boleta con ese codigo interno.',
  raffles_org_name_key: 'Ya existe una rifa con ese nombre en la organizacion.',
  raffles_org_short_code_key: 'Ya existe una rifa con ese codigo en la organizacion.',
  raffles_dates_check: 'La fecha de fin no puede ser anterior a la de inicio.',
  memberships_org_profile_key: 'Esa persona ya pertenece a la organizacion.',
  memberships_one_owner_per_org: 'La organizacion ya tiene un dueno activo.',
  tickets_numbers_required_unless_draft:
    'Una boleta que no es borrador debe tener numero diario y semanal.',
  tickets_paid_amount_range: 'El valor supera el saldo pendiente de la boleta.',
  alloc_payment_ticket_key: 'Ese pago ya tiene un valor aplicado a esa boleta.',
  clients_seller_org_fk: 'El vendedor indicado no pertenece a la organizacion.',
  profiles_phone_check: 'El telefono no tiene un formato valido.',
  clients_phone_check: 'El telefono no tiene un formato valido.',
}

const GENERIC_MESSAGE = 'Ocurrio un error. Intenta de nuevo.'

/**
 * Codigos cuyos mensajes SI se propagan: los generan nuestras funciones RPC y
 * triggers con `raise exception` y ya vienen redactados en espanol para el
 * usuario final (docs/PHASE_STATUS.md, punto 6 de la Fase 3).
 *
 *   P0001 -> `raise exception` sin errcode explicito.
 *   23514 -> `using errcode = 'check_violation'` de nuestros triggers.
 *   42501 -> `using errcode = 'insufficient_privilege'` de nuestras RPC.
 */
const BUSINESS_MESSAGE_CODES = new Set(['P0001', '23514', '42501'])

/**
 * Firma de los mensajes que redacta PostgreSQL, no nosotros. Si un mensaje
 * coincide, se traduce por restriccion o se cae al generico: propagarlo
 * filtraria nombres de tablas, columnas y hasta valores de la fila.
 */
const POSTGRES_INTERNAL_MESSAGE =
  /violates (check|unique|foreign key|not-null|exclusion) constraint|duplicate key value|permission denied|relation "|column "|new row for relation/i

function extractConstraintName(message: string): string | null {
  return /constraint "([^"]+)"/.exec(message)?.[1] ?? null
}

export function mapPgError(error: unknown): string {
  if (!error || typeof error !== 'object') return GENERIC_MESSAGE

  const pgError = error as PgLikeError
  const code = pgError.code ?? undefined
  const message = pgError.message ?? ''

  // 1. Restricciones con significado de negocio conocido.
  const constraintName = extractConstraintName(message)
  if (constraintName && CONSTRAINT_MESSAGES[constraintName]) {
    return CONSTRAINT_MESSAGES[constraintName]
  }

  // 2. Mensajes de negocio escritos por nuestras funciones y triggers.
  if (code && BUSINESS_MESSAGE_CODES.has(code) && message.trim() !== '') {
    if (!POSTGRES_INTERNAL_MESSAGE.test(message)) {
      return message.trim()
    }
  }

  // 3. Mapeo por codigo.
  if (code) {
    const pgMessage = PG_ERROR_MESSAGES[code]
    if (pgMessage) return pgMessage
    const authMessage = AUTH_ERROR_MESSAGES[code]
    if (authMessage) return authMessage
  }

  return GENERIC_MESSAGE
}
