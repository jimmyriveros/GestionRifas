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
 * forma peor de responder esa misma pregunta. Dejarlos fuera acorta la lista y
 * evita tener que inventar como se dice «de Borrador a Anulada».
 *
 * Quien pasa las opciones decide que columnas admite SU pantalla y SU rol: aqui
 * no hay ninguna lista blanca, solo se pinta lo que se recibe.
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
  className?: string
}

/** Valor centinela del orden por defecto: `Select` no admite `value=""`. */
const DEFAULT_VALUE = 'default'

/** La clave de una opcion, para casarla con lo que dice la direccion. */
function keyOf(sort: ListSort | null): string {
  return sort === null ? DEFAULT_VALUE : `${sort.column}:${sort.direction}`
}

export function ListSortSelect({ options, label, className }: ListSortSelectProps) {
  const { sort, setSort, pending } = useListSort()

  /*
    Lo que dice la direccion puede no estar entre las opciones: un enlace viejo,
    o un orden que solo existe en la tabla de escritorio. Entonces se cae al
    valor por defecto, igual que hace `parseListSort` con una columna
    desconocida: la pantalla no miente diciendo que ordena por algo que no
    ofrece, y el orden real lo sigue aplicando la consulta.
  */
  const current = keyOf(sort)
  const known = options.some((option) => keyOf(option.sort) === current)

  return (
    <Select
      value={known ? current : DEFAULT_VALUE}
      onValueChange={(value) => {
        const chosen = options.find((option) => keyOf(option.sort) === value)
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
        {options.map((option) => (
          <SelectItem key={keyOf(option.sort)} value={keyOf(option.sort)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
