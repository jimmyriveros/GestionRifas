import type { Metadata } from 'next'
import { HourglassIcon } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Estamos actualizando Rifas',
  robots: { index: false, follow: false },
}

/**
 * Lo que se ve mientras la API de datos está en PAUSA DE PUBLICACIÓN (D-239).
 *
 * La base rechaza toda petición (`supabase/maintenance/pausa.sql`) y las guardas
 * traen aquí a quien navega, con su sesión intacta: al abrir, «Reintentar» lo
 * devuelve a su panel sin volver a entrar. Nada de «Tu cuenta está inactiva»,
 * que era lo que habría dicho la guarda (I-115).
 *
 * PÚBLICA Y SIN CONSULTAS: la sirve el proxy sin sesión (`PUBLIC_PATHS`) y no lee
 * nada, porque durante la pausa no hay nada que leer. Se PRERENDERIZA y no
 * ejecuta JavaScript, como `/denied` (I-070): lo único que tiene es un enlace, y
 * un enlace funciona sin React. Si algún día lleva algo interactivo, necesita
 * `export const dynamic = 'force-dynamic'`.
 *
 * EL TEXTO DICE LO QUE ES VERDAD Y NADA MÁS: lo registrado antes de la pausa
 * sigue guardado —la publicación no borra datos—, y durante la pausa no se
 * guarda nada nuevo, así que no se promete lo contrario (D-116).
 */
export default function MaintenancePage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <HourglassIcon className="text-muted-foreground size-12" aria-hidden="true" />
      <div className="max-w-sm space-y-1">
        <h1 className="text-xl font-semibold">Estamos actualizando Rifas</h1>
        <p className="text-muted-foreground">
          Vuelve a entrar en unos minutos. Lo que ya registraste sigue guardado.
        </p>
      </div>
      <Button asChild size="touch">
        <Link href="/">Reintentar</Link>
      </Button>
    </div>
  )
}
