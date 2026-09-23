'use client'

import { ArrowUpDownIcon } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ListSort } from '@/lib/list-sort'

import { useListSort } from './use-list-sort'

/**
 * Ordenar una lista DESDE EL TELEFONO (I-155, D-215).
 *
 * POR QUE EXISTE. Por debajo de `md` las listas no son una tabla: son tarjetas
 * (`TicketCardList`, `ClientCardList`), y la tabla queda oculta con
 * `display:none`, asi que sus cabeceras no estan en el arbol de accesibilidad
 * ni se pueden pulsar. Desde D-213 el orden lo aplica la base y viaja en la
 * direccion, pero en un telefono no habia forma de pedirlo: la unica era
 * escribir `?sort=` a mano.
 *
 * POR QUE UN SOLO CONTROL, Y NO UNO DE COLUMNA MAS OTRO DE SENTIDO. Cada opcion
 * nombra ya las dos cosas —«Falta, de mayor a menor»—, y eso resuelve tres
 * problemas de una vez:
 *
 *   * A 320 px la fila del telefono ya esta llena con «Filtros» y «Seleccionar
 *     varias» (D-108), que necesitan 160 px de texto. Un control mas en esa
 *     fila no cabe; uno en su propia linea, si.
 *   * Un boton generico de sentido no se puede escribir bien: «A–Z» miente
 *     sobre un importe y «mayor a menor» miente sobre un nombre. La frase
 *     entera dice lo que de verdad va a pasar.
 *   * El orden activo se LEE en el propio control, sin abrir nada. Guardarlo
 *     detras de «Filtros» lo habria escondido, y ademas el numero de ese boton
 *     cuenta filtros: un orden no es un filtro y no puede sumar ahi (D-107).
 *
 * NO SE OFRECEN LOS ESTADOS. «Estado de la boleta» y «Estado de pago» se
 * FILTRAN desde el mismo sitio, a un toque, y ordenar por un estado es una
 * forma peor de responder esa misma pregunta. Dejarlos fuera acorta la lista.
 * (Describir uno que ya esta puesto es otra cosa, y si se hace: ver `describe`
 * mas abajo. Invitar a poner un orden y contar el que hay no piden lo mismo.)
 *
 * Quien pasa las opciones decide que columnas ofrece SU pantalla y SU rol.
 *
 * OFRECER MENOS NO ES PODER MENOS (D-216). La consulta acepta mas columnas que
 * las que este control ofrece, y un enlace traido de la pantalla grande puede
 * pedir una de ellas. Hay que distinguir DOS cosas que se parecen y no lo son:
 *
 *   * un orden que la consulta RECHAZA —no esta en su lista blanca, asi que
 *     `parseListSort` lo descarta y la lista sale en su orden de siempre—: ahi
 *     el control dice el orden por defecto, y acierta;
 *   * un orden que la consulta APLICA y este control no ofrece: ahi el control
 *     tiene que DECIRLO. Caer al valor por defecto seria anunciar «Más
 *     recientes primero» mientras la lista sale por rifa.
 *
 * Para el segundo caso se anade una opcion mas, al principio y ya elegida, con
 * la frase que compone `describe`. Elegir otra la hace desaparecer, porque deja
 * de ser el orden puesto. Y pasar de escritorio a telefono NO cambia el orden:
 * el control se limita a contarlo.
 */

export type ListSortOption = {
  /** Lo que se lee: la columna y el sentido, en una frase. */
  label: string
  /** `null` es el orden por defecto de la lista, y borra los parametros. */
  sort: ListSort | null
}

type ListSortSelectProps = {
  options: readonly ListSortOption[]
  /** Nombre accesible: «Ordenar las boletas», «Ordenar los clientes». */
  label: string
  /**
   * Las columnas que LA CONSULTA acepta, que son mas que las ofrecidas. Sin
   * esto no hay forma de distinguir un orden rechazado de uno que si se aplica
   * y aqui no aparece (D-216).
   */
  allowed: readonly string[]
  /** Como se lee un orden aceptado que no esta entre las opciones. */
  describe: (sort: ListSort) => string | null
  /**
   * Sustituye el texto de la opcion por defecto cuando ese orden cambia por el
   * contexto. Hoy solo lo usa «Mis boletas»: buscando, la lista sale por
   * relevancia y no por fecha, y «restablecer el orden» devuelve ahi.
   */
  defaultLabel?: string
  /**
   * El orden por defecto de la lista, ESCRITO (D-216, corregido).
   *
   * Una lista puede llegar a su orden de siempre por dos direcciones: sin
   * parametros, o pidiendolo por su nombre. En «Mis clientes» el orden de
   * siempre es el nombre ascendente, asi que `?sort=name` y una direccion
   * limpia producen exactamente la misma lista, y las dos tienen que verse
   * igual en el control.
   *
   * Sin esto, `?sort=name` no casaba con ninguna opcion —la del defecto vale
   * `null`— y el control se quedaba sin valor que ensenar.
   *
   * «Mis boletas» no lo necesita: su orden de siempre es `created_at`, que no
   * esta en la lista blanca y por tanto no se puede pedir por la direccion.
   */
  defaultSort?: ListSort
  className?: string
}

/** Valor centinela del orden por defecto: `Select` no admite `value=""`. */
const DEFAULT_VALUE = 'default'

/** La clave de una opcion, para casarla con lo que dice la direccion. */
function keyOf(sort: ListSort | null): string {
  return sort === null ? DEFAULT_VALUE : `${sort.column}:${sort.direction}`
}

export function ListSortSelect({
  options,
  label,
  allowed,
  describe,
  defaultLabel,
  defaultSort,
  className,
}: ListSortSelectProps) {
  const { sort, setSort, pending } = useListSort()

  /*
    Cuatro situaciones, y cada una tiene su respuesta:

      1. la direccion no pide orden, o pide uno que la consulta RECHAZA. En las
         dos la lista sale en su orden por defecto, asi que se elige esa opcion;
      2. pide, por su nombre, el orden que YA es el de siempre —`?sort=name` en
         clientes—: es la misma lista, asi que tambien es esa opcion;
      3. pide uno que este control ofrece: esa opcion;
      4. pide uno que la consulta aplica y este control no ofrece: se anade una
         opcion para el, al principio, y queda elegida.

    Lo que NO se hace en NINGUN caso es reescribir la direccion. El control
    cuenta el orden; no lo cambia por su cuenta. En el caso 2 eso significa
    dejar `?sort=name` puesto: produce la misma lista, y quitarlo seria cambiar
    la direccion de alguien a su espalda.
  */
  const requested = sort !== null && allowed.includes(sort.column) ? sort : null
  const isDefault =
    requested !== null &&
    defaultSort !== undefined &&
    requested.column === defaultSort.column &&
    requested.direction === defaultSort.direction

  const applied = isDefault ? null : requested
  const current = keyOf(applied)
  const offered = options.some((option) => keyOf(option.sort) === current)
  const extra = applied !== null && !offered ? describe(applied) : null

  /*
    El texto de la opcion por defecto se sustituye SIEMPRE que haga falta,
    tambien cuando hay una opcion anadida: buscando y con la rifa pedida, la
    opcion que restablece sigue devolviendo a la relevancia y tiene que
    decirlo. Antes esta sustitucion vivia en la otra rama y se la saltaba.
  */
  const base: readonly ListSortOption[] =
    defaultLabel === undefined
      ? options
      : options.map((option) =>
          option.sort === null ? { ...option, label: defaultLabel } : option,
        )

  const shown: readonly ListSortOption[] =
    extra !== null ? [{ label: extra, sort: applied }, ...base] : base

  return (
    <Select
      value={current}
      onValueChange={(value) => {
        const chosen = shown.find((option) => keyOf(option.sort) === value)
        if (chosen) setSort(chosen.sort)
      }}
    >
      {/* 44 px de alto, como «Filtros» y «Seleccionar varias» de la fila de
          arriba: en el telefono los tres controles de la pantalla miden lo
          mismo. El icono acompana al texto, no lo sustituye.

          NO SE DESHABILITA MIENTRAS NAVEGA, y esto se midio: con
          `disabled={pending}` el navegador quita el foco del boton en cuanto se
          deshabilita, y al volver a habilitarse el foco ya estaba en `body`.
          Quien ordena con el teclado perdia su sitio en cada eleccion. Un
          segundo toque durante la transicion no rompe nada: la navegacion
          nueva sustituye a la anterior. Se anuncia con `aria-busy`, que no
          toca el foco. */}
      <SelectTrigger
        aria-label={label}
        aria-busy={pending}
        /*
          El icono y la frase son UN grupo, pegados a la izquierda; la flecha se
          queda a la derecha. Sin esto, el `justify-between` del primitivo los
          separa y el texto queda flotando en mitad del boton, que a simple
          vista se lee como un titulo centrado y no como el valor de un control.
        */
        className={cn(
          '*:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:justify-start',
          className,
        )}
        size="touch"
      >
        <ArrowUpDownIcon className="size-4 shrink-0 opacity-60" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {shown.map((option) => (
          <SelectItem key={keyOf(option.sort)} value={keyOf(option.sort)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
