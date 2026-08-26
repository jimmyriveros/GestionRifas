import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ForgotPasswordForm } from '@/features/auth/components/ForgotPasswordForm'

/**
 * SE RENDERIZA POR PETICION, y de eso depende que la pantalla funcione (I-070).
 *
 * QUE PASABA. Esta pagina no lee nada del request, asi que Next la
 * PRERENDERIZABA. La Content-Security-Policy de este proyecto usa
 * `'strict-dynamic'` con un nonce distinto en cada peticion (D-061), y un HTML
 * generado al construir no puede llevar ese nonce, asi que el navegador
 * bloqueaba TODOS sus scripts. React nunca hidrataba.
 *
 * QUE SIGNIFICABA para quien intentaba recuperar su contrasena: al pulsar
 * «Enviar enlace de recuperacion», el formulario caia a su envio NATIVO por GET
 * —no hay `action`, solo `onSubmit`—, la direccion pasaba a
 * `/forgot-password?email=…`, no se validaba nada, **no se llamaba a la Server
 * Action y no se enviaba ningun correo**. Ademas el correo escrito quedaba en la
 * URL y en el registro de accesos, que es el patron de I-066.
 *
 * POR QUE ESTA LINEA lo arregla: con la pagina dinamica, Next lee el nonce de la
 * cabecera `x-nonce` que pone `src/proxy.ts` y se lo pone a cada script, de modo
 * que el nonce del HTML y el de la cabecera coinciden. Es lo que documenta la
 * guia de CSP de Next: «to use a nonce, your page must be dynamically
 * rendered». `await connection()` dentro del componente seria equivalente; se
 * elige el export porque se puede comprobar desde una prueba
 * (`tests/unit/csp-dynamic-pages.test.ts`).
 *
 * OJO AL PROBARLO: en `next dev` NO se reproduce, porque en desarrollo Next
 * renderiza todo por peticion. Solo se ve en un build de produccion.
 */
export const dynamic = 'force-dynamic'

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar contraseña</CardTitle>
        <CardDescription>Te enviaremos un enlace a tu correo para restablecerla.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ForgotPasswordForm />
        <Link
          href="/login"
          className="text-muted-foreground hover:text-foreground block text-center text-sm"
        >
          Volver a iniciar sesión
        </Link>
      </CardContent>
    </Card>
  )
}
