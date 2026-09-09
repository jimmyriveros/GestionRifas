'use client'

import { CheckIcon, CopyIcon, ExternalLinkIcon, Share2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { catalogShareData, isShareCancelled } from '../share'
import { useClipboard } from '../use-clipboard'
import { StatusBadge } from '@/components/data/StatusBadge'

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
 * Cada boton: icono encima del texto cuando la tarjeta es estrecha, icono al
 * lado cuando da de si.
 *
 * `@lg/acciones` = 512 px de CONTENIDO de la tarjeta, y la medida no es
 * redonda por gusto: «Copiar enlace» mide 96 px a 14 px/500, mas 16 de icono,
 * 8 de hueco y 24 de aire son 144 px de boton; como «Compartir» se lleva 1,4
 * partes de 3,4, la fila entera necesita 144 x 3,4 + 16 de huecos = 506. A 448
 * —el escalon anterior— los tres botones cabian pero «Copiar enlace» se partia
 * en dos renglones DENTRO del boton, que se lee peor que apilarlo a proposito.
 *
 * Por debajo de esa medida el texto baja bajo el icono y ahi si cabe entero: se
 * abrevia el ESPACIO, nunca el termino (D-114).
 *
 * `h-auto min-h-11` en vez de `h-11`: apilado, el boton necesita crecer con su
 * texto, y una altura fija lo recortaria. El suelo de 44 px se conserva en las
 * dos formas y en todos los anchos —esta pantalla se usa de pie y con una mano
 * (D-085)—, y por eso NO se usa `size="touch"`, que baja a 36 px desde `sm`.
 */
const ACTION =
  'h-auto min-h-11 flex-col gap-1 px-1 py-2 text-xs whitespace-normal ' +
  '@lg/acciones:h-11 @lg/acciones:flex-row @lg/acciones:gap-2 @lg/acciones:px-3 ' +
  '@lg/acciones:text-label-medium'

/**
 * «Comparte tu catálogo», en el panel del vendedor (BR-K13, D-161, D-180).
 *
 * SOLO VE, ABRE, COPIA Y COMPARTE. No hay aqui ni un control para encender,
 * apagar, cambiar el WhatsApp o regenerar el enlace: eso lo hace el Dueño o el
 * Administrador desde la ficha del vendedor, y la Server Action lo exige
 * (`authorizeAction(['owner','admin'])`). Un vendedor tampoco puede consultar el
 * de otro: `getCatalogSettings` va por la RLS (BR-K12).
 *
 * ES UN BLOQUE DE ACCION, no una ficha (D-180). Lo primero que se ve al entrar
 * al panel es esto, asi que dice lo justo para decidir en un segundo: cuantas
 * boletas hay que repartir y los tres botones para repartirlas. **La direccion
 * ya no se escribe**: ocupaba la linea mas visible de la tarjeta para un texto
 * que nadie teclea —se comparte o se copia, nunca se lee— y que ademas habia
 * que recortar. Sigue entera donde se usa: en el `href` de «Ver catálogo», en
 * el portapapeles y en el menu del sistema.
 *
 * EN SU SITIO VA LO QUE SI SE MIRA: cuantas boletas quedan por vender en la
 * rifa publicada. Es la cifra que decide si merece la pena mandar el enlace hoy,
 * y viene de la MISMA lectura que ya alimentaba el panel
 * (`availableByRaffle`), no de una consulta nueva ni del recuento publico.
 *
 * DOS ESTADOS, Y EL APAGADO NO OFRECE NINGUNA ACCION. Con el catalogo sin
 * publicar, con la rifa cerrada o sin enlace generado, los tres botones **no se
 * dibujan** y tampoco se dice ninguna cifra: un boton que lleva a una pagina que
 * responde «no encontrado» es peor que no tener boton, y contar boletas de un
 * catalogo que no abre no ayuda a nadie. Lo decide `isCatalogLive`, que reune
 * las mismas condiciones que la pagina publica (BR-K10).
 *
 * LOS TRES BOTONES LLEVAN TEXTO VISIBLE, no solo icono. «Compartir» es la
 * accion principal —de eso va la tarjeta— y se distingue por dos cosas a la vez:
 * es el unico relleno, y ocupa mas ancho que los otros dos. Ninguna de las dos
 * depende del color por si sola.
 */

export function SellerCatalogCard({
  publicUrl,
  raffleName,
  isLive,
  availableTickets,
  className,
}: {
  /** La direccion COMPLETA. `null` cuando todavia no hay enlace generado. */
  publicUrl: string | null
  /** Nombre de la rifa publicada; encabeza el mensaje que se comparte. */
  raffleName: string | null
  /** `true` si el enlace abre de verdad ahora mismo (`isCatalogLive`). */
  isLive: boolean
  /**
   * Boletas disponibles EN LA RIFA PUBLICADA, que son las que el catalogo
   * enseña (BR-K08). `null` cuando no hay rifa publicada de la que hablar.
   */
  availableTickets: number | null
  /** Colocacion dentro de la rejilla del panel. La decide la pantalla. */
  className?: string
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
    <Card className={cn('gap-4 py-4 md:py-5', className)} data-section="comparte-tu-catalogo">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        {/* Un encabezado de verdad: es una region del panel como las demas, y
            hasta ahora era la unica que no aparecia en el esquema de titulos,
            asi que no se podia saltar a ella con un lector de pantalla. */}
        <CardTitle className="min-w-0">
          <h2 className="text-heading-h4">Comparte tu catálogo</h2>
        </CardTitle>
        {/*
          El estado con PALABRAS, no solo con color (CLAUDE.md 27). No es una de
          las ocho etiquetas de `constants.ts` —esas no se improvisan—: describe
          este interruptor y solo existe en las dos tarjetas del catalogo.
        */}
        <StatusBadge tone={live ? 'success' : 'neutral'}>
          {live ? 'Activo' : 'Inactivo'}
        </StatusBadge>
      </CardHeader>

      {/* `flex flex-1 flex-col`: la tarjeta se estira para igualar la altura de
          la de loterias (D-181), y el contenido tiene que estirarse con ella o
          el aire sobrante quedaria FUERA, debajo del ultimo boton. */}
      <CardContent className="@container/acciones flex flex-1 flex-col gap-3">
        {live ? (
          <>
            {/* Lo que hay que repartir. Se calla cuando no se sabe —sin rifa
                publicada no hay boletas de las que hablar— en vez de escribir
                un cero que se leeria como «no te queda ninguna». */}
            {availableTickets !== null ? (
              <p className="text-body-small text-muted-foreground" data-testid="catalog-available">
                {availableTickets === 1
                  ? '1 boleta disponible'
                  : `${availableTickets} boletas disponibles`}
              </p>
            ) : null}

            {/* Las tres en una fila. «Compartir» se lleva 1,4 partes de las 3,4
                que hay: es la accion principal y se nota tambien en el ancho,
                no solo en el relleno.

                `mt-auto`: cuando la tarjeta se estira, el aire sobrante se pone
                ENCIMA de los botones, no debajo. Asi quedan a ras del borde
                inferior, como una accion de tarjeta, en vez de flotando en
                mitad de un hueco (D-181). */}
            <div className="mt-auto grid grid-cols-[1.4fr_1fr_1fr] gap-2">
              <Button type="button" className={ACTION} onClick={() => share(publicUrl, raffleName)}>
                <Share2Icon className="size-4" aria-hidden />
                Compartir
              </Button>

              <Button
                type="button"
                variant="outline"
                className={ACTION}
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
              <Button asChild variant="outline" className={ACTION}>
                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="size-4" aria-hidden />
                  Ver catálogo
                </a>
              </Button>
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
