import { TargetIcon, UsersIcon } from 'lucide-react'

import type { PublicCatalogTicket } from '../queries'

/**
 * La franja de resumen del catalogo publico (D-163).
 *
 * SOLO DICE CIFRAS QUE EXISTEN, Y DICE DE QUE SON. El diseño de referencia
 * enseña cuatro tarjetas —premio principal, disponibles, tomados y frecuencia
 * del sorteo—; aqui hay dos, y no es un descuido:
 *
 *   * El PREMIO no esta modelado. Una rifa tiene nombre, precio y fechas; no
 *     tiene un campo «premio». Escribir el nombre de la rifa bajo el rotulo
 *     «Premio principal» seria afirmar algo que nadie ha dicho, y ademas ya se
 *     lee entero en el titulo, dos centimetros mas arriba.
 *   * La FRECUENCIA del sorteo tampoco. «Todos los sábados» no sale de ningun
 *     dato: saldria de haberlo escrito en el codigo.
 *
 * Y LAS DOS QUE SI ESTAN SE CUENTAN DE LO QUE YA LLEGO. El catalogo pide como
 * mucho `50 + 1` boletas por peticion y NO cuenta el inventario, que es
 * justamente lo caro (BR-K11). Contar el total habria significado una funcion
 * nueva en la base de datos y una consulta mas por visita; contar lo que ya
 * esta en memoria no cuesta nada. Por eso cada cifra dice su alcance: «En esta
 * página» cuando hay mas de una, «En tu búsqueda» cuando se ha buscado, y su
 * significado cuando lo que se ve ES el catalogo entero.
 *
 * NO ES UNA LISTA `<ul>`: es una lista de descripcion, que es lo que son un
 * rotulo y su cifra.
 */

type Alcance = 'busqueda' | 'pagina' | 'todo'

function alcanceDe({ searching, partial }: { searching: boolean; partial: boolean }): Alcance {
  if (searching) return 'busqueda'
  if (partial) return 'pagina'
  return 'todo'
}

const ALCANCE_LABEL: Record<Alcance, string | null> = {
  busqueda: 'En tu búsqueda',
  pagina: 'En esta página',
  todo: null,
}

function SummaryItem({
  icon,
  label,
  value,
  caption,
}: {
  icon: React.ReactNode
  label: string
  value: number
  caption: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className="bg-primary/15 text-primary-foreground ring-primary/25 flex size-10 shrink-0 items-center justify-center rounded-full ring-1"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="text-xl leading-tight font-semibold tabular-nums">{value}</dd>
        <p className="text-muted-foreground truncate text-xs">{caption}</p>
      </div>
    </div>
  )
}

export function CatalogSummary({
  tickets,
  searching,
  partial,
}: {
  tickets: PublicCatalogTicket[]
  /** Hay un termino escrito en el buscador. */
  searching: boolean
  /** Hay mas de una pagina: lo que se ve no es todo el catalogo. */
  partial: boolean
}) {
  if (tickets.length === 0) return null

  const disponibles = tickets.filter((ticket) => !ticket.taken).length
  const tomados = tickets.length - disponibles

  const alcance = alcanceDe({ searching, partial })
  const scope = ALCANCE_LABEL[alcance]

  return (
    <dl className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm sm:grid-cols-2 sm:divide-x sm:divide-white/10">
      <SummaryItem
        icon={<TargetIcon className="size-5" />}
        label="Números disponibles"
        value={disponibles}
        caption={scope ?? (disponibles > 0 ? 'Puedes elegir el tuyo' : 'Por ahora no queda ninguno')}
      />
      <SummaryItem
        icon={<UsersIcon className="size-5" />}
        label="Números tomados"
        value={tomados}
        caption={scope ?? 'Ya tienen dueño'}
      />
    </dl>
  )
}
