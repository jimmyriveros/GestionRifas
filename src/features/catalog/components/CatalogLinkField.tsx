'use client'

import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * El enlace publico, listo para copiar (BR-K12).
 *
 * UN SOLO COMPONENTE PARA LOS DOS PORTALES, como manda D-051: el Dueño lo ve en
 * la ficha del vendedor y el vendedor lo ve en su propio panel. Lo unico que
 * cambia entre los dos es el texto de ayuda, que se pasa como propiedad.
 *
 * EL CAMPO ES DE SOLO LECTURA, no texto suelto. Un `<input readOnly>` se puede
 * seleccionar entero con un toque, se puede leer con el teclado y el navegador
 * lo anuncia con su etiqueta; un `<p>` con la URL obliga a arrastrar el dedo
 * sobre el texto exacto, que en un telefono es justo lo que no sale bien.
 *
 * `navigator.clipboard` puede fallar —contexto no seguro, permiso denegado— y
 * entonces NO se dice que se copio: se avisa de que hay que copiarlo a mano.
 * Prometer un exito que no ocurrio es peor que no ofrecer el boton.
 */
export function CatalogLinkField({
  url,
  label = 'Enlace público',
  description,
}: {
  url: string
  label?: string
  description?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Enlace copiado.')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No pudimos copiar el enlace. Selecciónalo y cópialo a mano.')
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="catalog-public-url" className="text-xs">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id="catalog-public-url"
          readOnly
          value={url}
          // Seleccionar todo al enfocar: quien lo abre viene a copiarlo.
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={copy}
          aria-label="Copiar el enlace público"
        >
          {copied ? (
            <CheckIcon className="size-4" aria-hidden />
          ) : (
            <CopyIcon className="size-4" aria-hidden />
          )}
          <span className="sr-only sm:not-sr-only">Copiar</span>
        </Button>
      </div>
      {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
    </div>
  )
}
