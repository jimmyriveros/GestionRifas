import { ShieldAlertIcon } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

/**
 * ESTA PAGINA SE PRERENDERIZA, y por tanto NO EJECUTA JAVASCRIPT (I-070).
 *
 * No es un descuido: es correcto AQUI y solo aqui. La CSP usa `'strict-dynamic'`
 * con un nonce por peticion (D-061) y un HTML generado al construir no puede
 * llevarlo, asi que el navegador bloquea sus scripts. Lo unico interactivo de
 * esta pantalla es un enlace, y un enlace funciona sin JavaScript: `next/link`
 * pinta un `<a href>` de verdad. A cambio se sirve desde el CDN, sin despertar
 * ninguna funcion.
 *
 * ⚠️ SI ALGUN DIA ESTA PANTALLA NECESITA UN BOTON, un formulario o cualquier
 * cosa que dependa de React, hay que anadirle `export const dynamic =
 * 'force-dynamic'` —como lleva `/forgot-password`— o no funcionara en
 * produccion. Y no se notara en `next dev`, donde todo se renderiza por
 * peticion. Ver `docs/SECURITY.md` §10.1.b.
 */
export default function DeniedPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <ShieldAlertIcon className="text-muted-foreground size-12" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-semibold">Acceso denegado</h1>
        <p className="text-muted-foreground">No tienes permiso para ver esta página.</p>
      </div>
      <Button asChild>
        <Link href="/">Ir a mi panel</Link>
      </Button>
    </div>
  )
}
