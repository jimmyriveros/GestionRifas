import { redirect } from 'next/navigation'

import { Notice } from '@/components/feedback/Notice'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { safeNextPath } from '@/features/auth/safe-next-path'
import { dashboardPathForRole, getActiveMembershipOrMaintenance } from '@/lib/auth/guards'
import { getAuthUser } from '@/lib/auth/session'

type LoginPageProps = {
  // `next` puede llegar repetido (`?next=a&next=b`): Next lo entrega como lista.
  searchParams: Promise<{ next?: string | string[]; error?: string; message?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams

  const user = await getAuthUser()
  if (user) {
    const membership = await getActiveMembershipOrMaintenance()
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
          <div className="mb-4">
            <Notice tone="success">
              Tu contraseña se actualizó correctamente. Ingresa con ella.
            </Notice>
          </div>
        ) : null}
        {/* Solo una ruta de Rifas viaja al formulario (D-253); la acción la vuelve a comprobar. */}
        <LoginForm next={safeNextPath(params.next) ?? undefined} initialError={initialError} />
      </CardContent>
    </Card>
  )
}
