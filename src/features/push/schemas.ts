import { z } from 'zod'

/**
 * Validación de una suscripción Web Push (BR-V06, D-190).
 *
 * Capa de cliente y de servidor. La tercera son los CHECK de la `0053`
 * —`endpoint_https`, `endpoint_length`, `p256dh_shape`, `auth_shape`— y la RPC,
 * que son los que mandan.
 *
 * NO HAY CAMPO DE PERSONA: sale de la sesión y de `auth.uid()`.
 *
 * Lo que llega aquí lo produce el navegador, no una persona escribiendo, así
 * que estos mensajes **no se enseñan**: si alguno se disparara sería un defecto
 * nuestro, no algo que alguien pueda corregir. La pantalla muestra
 * `PUSH_COPY.failed`, que sí dice qué hacer.
 */

/** Las mismas formas que los CHECK de la `0053`, ni más estrictas ni menos. */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .min(30)
    .max(2048)
    .startsWith('https://', 'El endpoint de una suscripción es siempre https.'),
  p256dh: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{80,120}$/),
  auth: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{16,40}$/),
  userAgent: z.string().trim().max(400).optional(),
})

export const pushEndpointSchema = z.object({
  endpoint: z.string().trim().min(30).max(2048),
})
