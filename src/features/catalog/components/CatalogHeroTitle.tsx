'use client'

import { useCatalogSticky } from '../sticky'

/**
 * El titulo del hero, observado para que el encabezado sepa cuando recogerlo
 * (D-164).
 *
 * ES EL `h1` CANONICO Y EL UNICO. Lo que el encabezado enseña al perderse este
 * de vista es un texto secundario, no otro encabezado: dos `h1` con el mismo
 * contenido dejarian un indice de la pagina con dos titulos y un lector de
 * pantalla anunciaria el mismo dos veces.
 *
 * EL TITULO SE DERIVA del nombre de la rifa, no se escribe en el codigo. Con la
 * rifa llamada «Sorteo Camioneta Kia 2027» sale «NÚMEROS DISPONIBLES SORTEO
 * CAMIONETA KIA 2027». Escribir ahi un nombre comercial fijo obligaria a tocar
 * el codigo —y desplegar— cada vez que la empresa cambie de premio, y mentiria
 * en cuanto hubiera una segunda rifa (D-159).
 *
 * Se pasa a mayusculas en JavaScript y no con `text-transform` para que el
 * texto que se ve y el que esta en el HTML sean el mismo: asi lo que lee un
 * lector de pantalla, lo que copia quien selecciona y lo que comprueba una
 * prueba coinciden.
 *
 * DOS LINEAS, UN SOLO TITULO: los dos `span` son partes del mismo `h1` y su
 * texto sigue siendo exactamente «NÚMEROS DISPONIBLES {RIFA}». El espacio va
 * DENTRO del segundo para no dejar un nodo de texto suelto entre dos bloques.
 */
export function CatalogHeroTitle({ raffleName }: { raffleName: string }) {
  const { observeTitle } = useCatalogSticky()

  return (
    <h1
      ref={observeTitle}
      className="mt-4 text-3xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-4xl md:text-5xl lg:text-6xl"
    >
      <span className="block">NÚMEROS DISPONIBLES</span>
      <span className="catalog-title-accent mt-1 block">
        {' '}
        {raffleName.toUpperCase()}
      </span>
    </h1>
  )
}
