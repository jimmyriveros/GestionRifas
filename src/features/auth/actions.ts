'use server'

import { redirect } from 'next/navigation'

import { dashboardPathForRole } from '@/lib/auth/guards'
import { getActiveMembership } from '@/lib/auth/session'
import { mapPgError } from '@/lib/errors'
import { checkRateLimit, RATE_LIMITS, resetRateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './schemas'

type ActionResult = { ok: true } | { error: string }

/**
 * Deja constancia de que esta persona ya tiene su cuenta configurada (BR-E14).
 *
 * Se llama en los dos momentos que lo demuestran: al terminar de definir una
 * contrasena y al entrar con una. No se puede deducir de `auth.users`, porque
 * GoTrue escribe un hash aleatorio en `encrypted_password` con solo abrir el
 * enlace de la invitacion (D-097, prueba BD E2-02).
 *
 * Nunca hace fallar la operacion que la invoca: entrar y cambiar la contrasena
 * funcionan igual si esto no llega a escribirse, y el siguiente ingreso lo
 * vuelve a intentar.
 */
async function markActivated(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_profile_activated')
  if (error) {
    console.error('mark_profile_activated', error)
  }
}

/** Evita open-redirect: solo se acepta una ruta interna relativa. */
function safeNextPath(next: string | undefined | null): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  return next
}

export async function login(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Revisa los datos ingresados.' }
  }
  const { email, password, next } = parsed.data

  // Se limita por CORREO y no por IP: detras de una misma oficina o de un dato
  // movil todos comparten IP, y bloquear por IP dejaria fuera a un equipo
  // entero de vendedores por culpa de uno. El limite duro y global sigue
  // siendolo el de Supabase Auth (D-062).
  const rateKey = `login:${email.toLowerCase()}`
  const rate = checkRateLimit(rateKey, RATE_LIMITS.login)
  if (!rate.allowed) {
    return { error: rate.message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: mapPgError(error) }
  }

  const membership = await getActiveMembership()
  if (!membership) {
    await supabase.auth.signOut()
    return { error: 'Tu cuenta está inactiva. Contacta a tu administrador.' }
  }

  // Entro bien: se le devuelve el cupo, para que unos fallos previos no lo
  // dejen bloqueado en su proximo intento legitimo.
  resetRateLimit(rateKey)

  // Entro CON CONTRASENA, asi que la tiene. Cubre a quien la definio por otro
  // camino —un enlace de acceso reenviado por el personal, por ejemplo—.
  if (membership.activatedAt === null) {
    await markActivated()
  }

  redirect(safeNextPath(next) ?? dashboardPathForRole(membership.role))
}

export async function logout(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Ingresa un correo válido.' }
  }

  // Cada intento envia un correo real. Al superar el limite se responde `ok`
  // igual que siempre: decir «demasiados intentos» revelaria que ese correo
  // existe, que es justo lo que este flujo evita.
  const rate = checkRateLimit(
    `password-reset:${parsed.data.email.toLowerCase()}`,
    RATE_LIMITS.passwordReset,
  )
  if (!rate.allowed) {
    return { ok: true }
  }

  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  })

  // Se responde ok siempre, exista o no el correo: evita enumerar usuarios.
  return { ok: true }
}

export async function resetPassword(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { error: mapPgError(error) }
  }

  // Este es EL momento: la persona acaba de configurar su cuenta. Desde aqui su
  // vendedor padre ya no puede cambiarle el correo ni eliminarla (BR-E16, BR-E17).
  await markActivated()

  redirect('/login?message=password_updated')
}

export async function changePassword(input: unknown): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Revisa los datos ingresados.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { error: mapPgError(error) }
  }

  await markActivated()

  return { ok: true }
}
