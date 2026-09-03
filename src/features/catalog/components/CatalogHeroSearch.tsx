'use client'

import { useCatalogSticky } from '../sticky'
import { CatalogSearch } from './CatalogSearch'

/**
 * El sitio del buscador dentro del hero (D-164, D-165).
 *
 * Mientras se vea, el campo se pinta aqui. Cuando se pierde de vista, se pinta
 * en la fila del encabezado (`CatalogHeader`) y este hueco se queda vacio —pero
 * NO se cierra—.
 *
 * POR QUE EL HUECO SE QUEDA. Dos razones, y las dos son de comportamiento, no
 * de estetica:
 *
 *   * Si el hueco se cerrara, la pagina daria un salto justo al cruzarse el
 *     umbral.
 *   * Y, sobre todo, el elemento observado es ESTE hueco: si al vaciarse
 *     cambiara de sitio, volveria a entrar en pantalla, el campo regresaria al
 *     hero, el hueco crecería otra vez… ese es el parpadeo infinito clasico de
 *     este patron.
 *
 * El hueco reserva lo que mide el campo del hero y nada mas, para que la
 * ilustracion y el resumen no queden a un abismo de distancia (D-165).
 */

/**
 * Alto reservado: el campo tactil de 44 px y la linea de la pista, que existe
 * siempre aunque este vacia. Si `SearchInput` cambia de alto, este numero
 * cambia con el.
 */
const SLOT_HEIGHT = '4rem'

export function CatalogHeroSearch() {
  const { searchDocked, observeSearch } = useCatalogSticky()

  return (
    <div ref={observeSearch} className="w-full max-w-xl md:mx-auto" style={{ minHeight: SLOT_HEIGHT }}>
      {searchDocked ? null : <CatalogSearch />}
    </div>
  )
}
