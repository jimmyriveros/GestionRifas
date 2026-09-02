'use client'

import { CheckIcon, CopyIcon, ExternalLinkIcon, Share2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { catalogShareData, isShareCancelled } from '../share'
import { useClipboard } from '../use-clipboard'

/**
 * Los tres avisos, escritos UNA vez.
 *
 * El de exito es el mismo se llegue copiando a proposito o porque compartir no
 * pudo: en los dos casos lo que ha pasado es que el enlace esta en el
 * portapapeles, y decirlo de dos maneras distintas solo obligaria a leer dos
 * veces lo mismo.
 */
const COPIED = 'Enlace copiado. Ya puedes enviarlo a tus clientes.'
const COPY_FAILED = 'No pudimos copiar el enlace. Selecciónalo y cópialo a mano.'
const SHARE_AND_COPY_FAILED =
  'No pudimos compartir ni copiar el enlace. Selecciónalo y cópialo a mano.'

/**
 * «Mi catálogo público», en el panel del vendedor (BR-K13, D-161).
 *
 * SOLO VE, ABRE, COPIA Y COMPARTE. No hay aqui ni un control para encender,
 * apagar, cambiar el WhatsApp o regenerar el enlace: eso lo hace el Dueño o el
 * Administrador desde la ficha del vendedor, y la Server Action lo exige
 * (`authorizeAction(['owner','admin'])`). Un vendedor tampoco puede consultar el
 * de otro: `getCatalogSettings` va por la RLS (BR-K12).
 *
 * DOS ESTADOS, Y EL APAGADO NO OFRECE NINGUNA ACCION. Con el catalogo sin
 * publicar, con la rifa cerrada o sin enlace generado, los tres botones **no se
 * dibujan**: un boton que lleva a una pagina que responde «no encontrado» es
 * peor que no tener boton. Lo decide `isCatalogLive`, que reune las mismas
 * condiciones que la pagina publica (BR-K10).
 *
 * LOS TRES BOTONES LLEVAN TEXTO VISIBLE, no solo icono, y miden 44 px de alto:
 * es la pantalla que un vendedor usa de pie y con una mano. «Compartir» es la
 * accion principal —de eso va la tarjeta— y ocupa la fila entera en el
 * telefono; las otras dos se reparten la de abajo.
 *
 * LA DIRECCION SE RECORTA A LA VISTA, NUNCA EN LO QUE SE USA. El `<p>` lleva
 * `truncate`, que es CSS: el texto completo sigue en el HTML —lo lee un lector
 * de pantalla y lo copia quien seleccione— y las tres acciones reciben siempre
 * `publicUrl` entero, no lo que se ve.
 */

export function SellerCatalogCard({
  publicUrl,
  raffleName,
  isLive,
}: {
  /** La direccion COMPLETA. `null` cuando todavia no hay enlace generado. */
  publicUrl: string | null
  /** Nombre de la rifa publicada; encabeza el mensaje que se comparte. */
  raffleName: string | null
  /** `true` si el enlace abre de verdad ahora mismo (`isCatalogLive`). */
  isLive: boolean
}) {
  const { copy, copied } = useClipboard()

  const live = isLive && publicUrl !== null && raffleName !== null

  /** Copia y dice lo que pasó. `whenFailed` cambia solo si veniamos de compartir. */
  async function copyLink(url: string, whenFailed = COPY_FAILED) {
    if (await copy(url)) toast.success(COPIED)
    else toast.error(whenFailed)
  }

  async function share(url: string, raffle: string) {
    // Sin `navigator.share` —escritorio, navegadores antiguos— se copia, que es
    // lo mas util que se puede hacer sin el menu del sistema.
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      await copyLink(url)
      return
    }

    try {
      await navigator.share(catalogShareData(raffle, url))
    } catch (error) {
      // Cerrar el menu a proposito NO es un error: ni se avisa, ni se copia
      // nada que nadie pidio. Cualquier otro fallo sí cae en el enlace copiado.
      if (isShareCancelled(error)) return
      await copyLink(url, SHARE_AND_COPY_FAILED)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Mi catálogo público</CardTitle>
        {/*
          El estado con PALABRAS, no solo con color (CLAUDE.md 27). No es una de
          las ocho etiquetas de `constants.ts` —esas no se improvisan—: describe
          este interruptor y solo existe en las dos tarjetas del catalogo.
        */}
        <Badge variant={live ? 'default' : 'outline'}>{live ? 'Activo' : 'Inactivo'}</Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        {live ? (
          <>
            <p
              className="text-muted-foreground truncate font-mono text-xs"
              // El completo, para quien pase el raton por encima de una
              // direccion recortada.
              title={publicUrl}
              data-testid="catalog-public-url"
            >
              {publicUrl}
            </p>

            <div className="space-y-2">
              <Button
                type="button"
                className="h-11 w-full"
                onClick={() => share(publicUrl, raffleName)}
              >
                <Share2Icon className="size-4" aria-hidden />
                Compartir
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => copyLink(publicUrl)}
                >
                  {copied ? (
                    <CheckIcon className="size-4" aria-hidden />
                  ) : (
                    <CopyIcon className="size-4" aria-hidden />
                  )}
                  Copiar enlace
                </Button>

                {/*
                  Un enlace de verdad, no un boton con `router.push`: se puede
                  abrir en otra pestaña, tiene menu contextual y el navegador lo
                  precarga. `target="_blank"` porque el vendedor esta trabajando
                  en su panel y no queremos sacarlo de ahi.
                */}
                <Button asChild variant="outline" className="h-11">
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLinkIcon className="size-4" aria-hidden />
                    Ver catálogo
                  </a>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Tu enlace todavía no está disponible. Pídele a quien administra la rifa que publique tu
            catálogo.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
