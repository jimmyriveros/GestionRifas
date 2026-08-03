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
}

const GENERIC_MESSAGE = 'Ocurrio un error. Intenta de nuevo.'

export function mapPgError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const pgError = error as PgLikeError
    const code = pgError.code
    const pgMessage = code ? PG_ERROR_MESSAGES[code] : undefined
    if (pgMessage) return pgMessage
    const authMessage = code ? AUTH_ERROR_MESSAGES[code] : undefined
    if (authMessage) return authMessage
  }
  return GENERIC_MESSAGE
}

export class AppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppError'
  }
}
