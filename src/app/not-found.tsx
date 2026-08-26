import Link from 'next/link'

import { Button } from '@/components/ui/button'

/**
 * SE PRERENDERIZA Y NO EJECUTA JAVASCRIPT, igual que `/denied` y por la misma
 * razon (I-070, `docs/SECURITY.md` §10.1.b). Aqui interesa ademas que siga
 * asi: esta pantalla la recibe CUALQUIER direccion que no exista, incluidos los
 * rastreadores automaticos, y hacerla dinamica despertaria una funcion en cada
 * uno de esos golpes. Lo unico que tiene es un enlace, que funciona sin React.
 *
 * ⚠️ Si algun dia lleva algo interactivo, necesita `export const dynamic =
 * 'force-dynamic'` o no funcionara en produccion.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <div>
        <h1 className="text-xl font-semibold">Página no encontrada</h1>
        <p className="text-muted-foreground">La página que buscas no existe o fue movida.</p>
      </div>
      <Button asChild>
        <Link href="/">Ir al inicio</Link>
      </Button>
    </div>
  )
}
