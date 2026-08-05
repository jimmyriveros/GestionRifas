import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Ingresa un correo válido.'),
  password: z.string().min(1, 'Ingresa tu contraseña.'),
  next: z.string().optional(),
})
export type LoginInput = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email: z.email('Ingresa un correo válido.'),
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

const passwordField = z
  .string()
  .min(8, 'Debe tener al menos 8 caracteres.')
  .max(72, 'Debe tener como máximo 72 caracteres.')

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: passwordField,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const changePasswordSchema = resetPasswordSchema
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
