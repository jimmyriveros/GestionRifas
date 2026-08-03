import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm'

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar contrasena</CardTitle>
        <CardDescription>Te enviaremos un enlace a tu correo para restablecerla.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ForgotPasswordForm />
        <Link
          href="/login"
          className="text-muted-foreground hover:text-foreground block text-center text-sm"
        >
          Volver a iniciar sesion
        </Link>
      </CardContent>
    </Card>
  )
}
