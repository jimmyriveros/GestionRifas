'use client'

import { ListChecksIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useTicketSelection } from '../TicketSelectionContext'

/**
 * Entrar y salir del modo seleccion, en el telefono.
 *
 * POR QUE VIVE SOLO Y NO DENTRO DE LA BARRA DE SELECCION (D-108). Su sitio en
 * pantalla esta junto a «Filtros», no debajo del recuento: las dos son las
 * herramientas con las que se prepara la lista antes de trabajar con ella, y
 * separarlas dejaba dos bloques de botones sueltos a distinta altura. Como el
 * boton de «Filtros» lo dibuja `TicketFilters`, este se le pasa a esa fila como
 * un nodo (`secondaryAction`) y aqui queda solo el comportamiento.
 *
 * SE LLAMA «SELECCIONAR VARIAS», NO «SELECCIONAR». Lo que hace no es marcar una
 * boleta: enciende un modo en el que se marcan varias para actuar sobre todas a
 * la vez. El verbo sigue siendo el del glosario —seleccionar—; «varias» es lo
 * unico que quien lo lee no puede deducir mirando la pantalla.
 *
 * Solo se pinta en el telefono, pero no lo decide este componente: la fila que
 * lo recibe ya es `md:hidden`. En escritorio la columna de casillas esta
 * siempre a la vista y no hay ningun modo al que entrar (D-082).
 */
export function TicketSelectionModeButton() {
  const selection = useTicketSelection()

  if (selection.selectionMode) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-11 grow"
        onClick={selection.exitSelectionMode}
      >
        <XIcon className="size-4" aria-hidden />
        Cancelar
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 grow"
      onClick={() => selection.startSelectionMode()}
    >
      <ListChecksIcon className="size-4" aria-hidden />
      Seleccionar varias
    </Button>
  )
}
