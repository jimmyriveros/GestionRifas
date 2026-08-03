import { redirect } from 'next/navigation'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm'
import { getAuthUser } from '@/lib/auth/session'

export default async function ResetPasswordPage() {
  const user = await getAuthUser()
  if (!user) {
    redirect('/login')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva contrasena</CardTitle>
        <CardDescription>Elige una contrasena segura para tu cuenta.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  )
}
