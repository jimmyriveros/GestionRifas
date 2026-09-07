import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Aviso en linea: explica una situacion que afecta a la pantalla que se esta
 * mirando, y a veces ofrece que hacer al respecto.
 *
 * NO ES UN TOAST NI UN DIALOGO. Son cuatro patrones distintos y conviene no
 * mezclarlos:
 *
 *   Notice       contexto permanente, dentro de la pagina, mientras su
 *                condicion sea cierta;
 *   AlertDialog  una decision que interrumpe (`components/ui/alert-dialog`);
 *   toast        un aviso que pasa y se va (`sonner`);
 *   StatusBadge  el estado de UN registro, en una insignia.
 *
 * Notice y StatusBadge comparten los colores de un tono y nada mas: una
 * insignia etiqueta un registro, un aviso explica una situacion. Por eso este
 * componente existe en vez de estirar la insignia.
 *
 * NO HAY TONO «ERROR» a proposito: ningun aviso real lo necesita, y los fallos
 * de un formulario ya se dicen de otra forma —un texto con `role="alert"` junto
 * al campo—, que es lo correcto porque ahi si hay que interrumpir.
 *
 * TAMPOCO HAY titulo, boton de cerrar, tamaños ni variante flotante: ninguna
 * pantalla los pide. Cuando alguna los pida, se añaden entonces. `density` NO
 * es un tamaño: no cambia la escala del componente ni su contenido, solo el
 * aire que lo rodea.
 */

export type NoticeTone = 'info' | 'success' | 'warning' | 'neutral'

/**
 * Lo COMPACTO no dice otra cosa, lo dice en menos sitio.
 *
 * La responsabilidad, la tipografia y la jerarquia del contenido son las
 * mismas; lo unico que cambia es el aire. Por eso es `density` y no `size`:
 * un `size` cambiaria la escala del componente, y aqui no cambia nada mas que
 * el relleno y el radio.
 *
 * `compact` es para un aviso que vive DENTRO de algo mas pequeño —una tarjeta,
 * un dialogo—, donde el relleno de pagina roba mas de lo que ordena.
 */
export type NoticeDensity = 'default' | 'compact'

const DENSITY_CLASSES: Record<NoticeDensity, string> = {
  default: 'rounded-lg px-4 py-3',
  compact: 'rounded-md px-3 py-2',
}

const TONE_CLASSES: Record<NoticeTone, string> = {
  info: 'bg-status-info-surface text-status-info-text border-status-info-border',
  success: 'bg-status-success-surface text-status-success-text border-status-success-border',
  warning: 'bg-status-warning-surface text-status-warning-text border-status-warning-border',
  neutral: 'bg-status-neutral-surface text-status-neutral-text border-status-neutral-border',
}

const ICON_CLASSES: Record<NoticeTone, string> = {
  info: 'text-status-info-icon',
  success: 'text-status-success-icon',
  warning: 'text-status-warning-icon',
  neutral: 'text-status-neutral-icon',
}

type NoticeProps = {
  tone: NoticeTone
  /** El texto del aviso. Es lo unico obligatorio, porque es lo que da el significado. */
  children: ReactNode
  /** Icono opcional. Es decorativo: se oculta a los lectores de pantalla. */
  icon?: ReactNode
  /** Accion opcional. Un control de verdad, con su propio foco. */
  action?: ReactNode
  /**
   * Solo para un aviso cuyo TEXTO cambia mientras la persona trabaja, como el
   * reparto de un abono. Anuncia el cambio de forma amable.
   *
   * Nunca `role="alert"` ni `aria-live="assertive"`: eso interrumpe la lectura,
   * y un aviso que ya estaba ahi al cargar la pantalla no tiene por que
   * interrumpir nada. Un aviso estatico se queda fuera de los anuncios.
   */
  live?: boolean
  /** Cuanto aire lleva. `compact` para un aviso dentro de una tarjeta o un dialogo. */
  density?: NoticeDensity
}

export function Notice({
  tone,
  children,
  icon,
  action,
  live = false,
  density = 'default',
}: NoticeProps) {
  return (
    <div
      // El color NUNCA es la unica señal (CLAUDE.md §27): el tono acompaña al
      // texto, que es quien dice lo que pasa.
      className={cn(
        'flex flex-col gap-2 border text-sm',
        DENSITY_CLASSES[density],
        'sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3',
        TONE_CLASSES[tone],
      )}
      aria-live={live ? 'polite' : undefined}
    >
      {/* Orden de lectura: icono, texto y accion, igual que se ven. */}
      <span className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
        {icon ? (
          <span
            className={cn(
              'mt-0.5 shrink-0 sm:mt-0 [&_svg]:size-4 [&_svg]:shrink-0',
              ICON_CLASSES[tone],
            )}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
        {/*
          `flex-1` para que un aviso pueda repartir su propio contenido a lo
          ancho —el del reparto de un abono lleva la cifra pegada a la derecha—
          sin tener que colarla por la ranura de la accion, que es para un
          control de verdad.
        */}
        <span className="min-w-0 flex-1 text-pretty">{children}</span>
      </span>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  )
}
