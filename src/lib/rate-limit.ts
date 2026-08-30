import 'server-only'

/**
 * Limitacion de intentos para las operaciones sensibles (Fase 7, D-062).
 *
 * QUE PROTEGE Y QUE NO
 *
 * Es una ventana deslizante EN MEMORIA del proceso. Eso acota honestamente su
 * alcance, y conviene tenerlo claro antes de confiar en ella:
 *
 *   * En un despliegue con varias instancias (Vercel escala por request), cada
 *     una lleva su propia cuenta. Un atacante repartido entre instancias
 *     obtiene un limite efectivo mayor que el configurado.
 *   * Un reinicio borra el contador.
 *
 * Por eso NO es la unica defensa, y en el caso del login ni siquiera la
 * principal: Supabase Auth aplica su propio limite del lado del servidor de
 * autenticacion, que es global y sobrevive a los reinicios (I-008). Esta capa
 * existe para lo que aquella no cubre:
 *
 *   * Frenar el goteo de peticiones de recuperacion de contrasena, que generan
 *     correo real hacia terceros.
 *   * Frenar la creacion masiva de invitaciones, que tambien genera correo y
 *     ademas cuesta cuota de Auth.
 *   * Dar un mensaje claro y temprano en vez de dejar que el usuario legitimo
 *     choque contra un error opaco del proveedor.
 *
 * Cuando el despliegue lo justifique, la sustitucion natural es un contador en
 * PostgreSQL o en un Redis compartido: la firma de `checkRateLimit` no tendria
 * que cambiar.
 */

type Attempt = { count: number; firstAt: number }

/**
 * Un `Map` por proceso. No crece sin control: cada consulta purga las entradas
 * cuya ventana ya vencio, y el numero de claves vivas esta acotado por el
 * numero de usuarios que actuan dentro de una misma ventana.
 */
const attempts = new Map<string, Attempt>()

export type RateLimitRule = {
  /** Intentos permitidos dentro de la ventana. */
  limit: number
  /** Duracion de la ventana, en milisegundos. */
  windowMs: number
}

/** Reglas de las operaciones sensibles (CLAUDE.md §26). */
export const RATE_LIMITS = {
  /**
   * Login: mas permisivo de lo que parece a proposito. Quien se equivoca de
   * contrasena suele reintentar varias veces seguidas, y bloquear a un vendedor
   * legitimo en mitad de una venta es un problema real. El limite duro lo pone
   * Supabase Auth.
   */
  login: { limit: 10, windowMs: 5 * 60_000 },
  /** Recuperacion de contrasena: cada intento envia un correo. */
  passwordReset: { limit: 3, windowMs: 15 * 60_000 },
  /** Invitaciones: cada una envia un correo y consume cuota de Auth. */
  invitation: { limit: 20, windowMs: 60 * 60_000 },
  /**
   * Integrantes de equipo, POR VENDEDOR (BR-E04). Desde que un vendedor puede
   * crear vendedores, uno solo podria vaciar el cupo de la organizacion entera
   * en una rafaga. Cinco por hora es holgado para el uso real —un equipo se
   * arma una vez— y deja el resto del cupo para el personal y para los demas.
   */
  teamInvitation: { limit: 5, windowMs: 60 * 60_000 },
  /**
   * Intentos fallidos al Route Handler de loterias. El secreto es largo; esto
   * solo frena el goteo, no sustituye la comparacion a tiempo constante.
   */
  lotterySyncAuth: { limit: 20, windowMs: 15 * 60_000 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitResult =
  { allowed: true } | { allowed: false; retryAfterSeconds: number; message: string }

/**
 * Registra un intento y dice si se permite.
 *
 * @param key    Identifica a quien intenta. Debe incluir el nombre de la
 *               operacion para que dos operaciones distintas no compartan
 *               contador (por ejemplo `login:ana@x.com`).
 * @param rule   Limite y ventana.
 * @param now    Inyectable para poder probar el paso del tiempo sin esperar.
 */
export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitResult {
  purgeExpired(now)

  const current = attempts.get(key)

  if (!current || now - current.firstAt >= rule.windowMs) {
    attempts.set(key, { count: 1, firstAt: now })
    return { allowed: true }
  }

  if (current.count >= rule.limit) {
    const retryAfterSeconds = Math.ceil((current.firstAt + rule.windowMs - now) / 1000)
    return {
      allowed: false,
      retryAfterSeconds,
      message: `Demasiados intentos. Espera ${formatWait(retryAfterSeconds)} e intenta de nuevo.`,
    }
  }

  current.count += 1
  return { allowed: true }
}

/**
 * Olvida un intento consumido.
 *
 * Se llama tras un login CORRECTO: si no, alguien que se equivoca varias veces
 * y despues acierta seguiria gastando su cupo, y podria quedarse fuera en el
 * siguiente intento legitimo.
 */
export function resetRateLimit(key: string): void {
  attempts.delete(key)
}

function purgeExpired(now: number): void {
  for (const [key, attempt] of attempts) {
    // La ventana mas larga configurada; purgar con ella nunca borra algo vivo.
    if (now - attempt.firstAt >= RATE_LIMITS.invitation.windowMs) {
      attempts.delete(key)
    }
  }
}

function formatWait(seconds: number): string {
  if (seconds < 60) return 'unos segundos'
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? 'un minuto' : `${minutes} minutos`
}

/** Solo para pruebas: deja el contador limpio entre casos. */
export function __clearRateLimits(): void {
  attempts.clear()
}
