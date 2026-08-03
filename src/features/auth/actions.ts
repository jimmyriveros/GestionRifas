'use server'

import { redirect } from 'next/navigation'

import { dashboardPathForRole } from '@/lib/auth/guards'
import { getActiveMembership } from '@/lib/auth/session'
import { mapPgError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './schemas'

type ActionResult = { ok: true } | { error: string }

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

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: mapPgError(error) }
  }

  const membership = await getActiveMembership()
  if (!membership) {
    await supabase.auth.signOut()
    return { error: 'Tu cuenta esta inactiva. Contacta a tu administrador.' }
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
    return { error: 'Ingresa un correo valido.' }
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

  return { ok: true }
}
