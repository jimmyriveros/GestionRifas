import { redirect } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { dashboardPathForRole } from '@/lib/auth/guards'
import { getActiveMembership, getAuthUser } from '@/lib/auth/session'

type LoginPageProps = {
  searchParams: Promise<{ next?: string; error?: string; message?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams

  const user = await getAuthUser()
  if (user) {
    const membership = await getActiveMembership()
    if (membership) {
      redirect(dashboardPathForRole(membership.role))
    }
  }

  const initialError =
    params.error === 'inactive'
      ? 'Tu cuenta está inactiva. Contacta a tu administrador.'
      : params.error === 'auth_callback'
        ? 'El enlace no es válido o ya expiró. Solicítalo nuevamente.'
        : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestión de Rifas</CardTitle>
        <CardDescription>Ingresa con tu correo y contraseña.</CardDescription>
      </CardHeader>
      <CardContent>
        {params.message === 'password_updated' ? (
          <p className="bg-success/10 text-success mb-4 rounded-md px-3 py-2 text-sm">
            Tu contraseña se actualizó correctamente. Ingresa con ella.
          </p>
        ) : null}
        <LoginForm next={params.next} initialError={initialError} />
      </CardContent>
    </Card>
  )
}
