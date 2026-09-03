'use client'

import { CATALOG_HEADER_HEIGHT, useCatalogSticky } from '../sticky'
import { CatalogSearch } from './CatalogSearch'

/**
 * El buscador del hero, que se posa bajo el encabezado al perderse de vista
 * (D-164).
 *
 * UNA SOLA INSTANCIA, Y ESTO ES LO IMPORTANTE. No hay un buscador en el hero y
 * otro en el encabezado: hay UNO que cambia de sitio en pantalla sin cambiar de
 * sitio en el DOM. De ahi salen tres garantias que con dos instancias habria
 * que perseguir a mano:
 *
 *   * **Nunca hay dos.** No es que el otro este oculto: es que no existe.
 *   * **No se pierde lo escrito, ni el foco, ni la posicion del cursor.** El
 *     nodo `<input>` no se desmonta ni se vuelve a crear, asi que el navegador
 *     no tiene nada que olvidar. Con dos instancias, o con un portal que cambia
 *     de contenedor, React destruye el nodo y el foco se va — y en un telefono
 *     eso pasa justo al abrirse el teclado, que es cuando mas duele.
 *   * **No hay dos estados que sincronizar.** El termino sigue viviendo en la
 *     URL y lo gestiona el mismo `useUrlSearch` de siempre.
 *
 * COMO SE POSA. El hueco del hero conserva SIEMPRE su altura; lo que cambia es
 * que el contenido pasa a `fixed` justo debajo del encabezado. Reservar el
 * hueco no es cosmetico: sin el, al posarse el buscador la pagina daria un
 * salto de 66 px y —peor— el elemento observado se moveria, que es como se
 * fabrica un parpadeo infinito (ver `sticky.tsx`).
 *
 * LO QUE NO CAMBIA: `q` en la URL, el debounce, la navegacion en servidor,
 * `Enter`, `Escape`, el reinicio de `page`, el teclado numerico, el indicador
 * de carga y las pistas bajo el campo. Es el mismo componente.
 */

/**
 * Alto reservado para el buscador dentro del hero.
 *
 * Es lo que mide `SearchInput` con `touchSize`: etiqueta oculta, campo de
 * 44 px, la separacion de `space-y-1.5` y la linea de la pista, que existe
 * siempre aunque este vacia. Si alguno de esos tres cambia, este numero cambia
 * con ellos.
 */
const SLOT_HEIGHT = '4.25rem'

export function CatalogHeroSearch() {
  const { searchDocked, observeSearch } = useCatalogSticky()

  return (
    <div
      ref={observeSearch}
      className="w-full max-w-xl md:mx-auto"
      style={{ minHeight: SLOT_HEIGHT }}
    >
      <div
        className={
          searchDocked
            ? // Posado: una fila propia pegada bajo el encabezado, con su mismo
              // fondo y su misma difuminacion para que se lea como una segunda
              // linea del encabezado y no como algo que flota encima.
              'fixed inset-x-0 z-30 border-b border-white/10 bg-[oklch(0.145_0.035_292_/_0.94)] px-4 pt-2 pb-1 backdrop-blur-md'
            : undefined
        }
        style={
          searchDocked
            ? { top: `calc(${CATALOG_HEADER_HEIGHT}px + env(safe-area-inset-top, 0px))` }
            : undefined
        }
      >
        <div className={searchDocked ? 'mx-auto w-full max-w-xl' : undefined}>
          <CatalogSearch />
        </div>
      </div>
    </div>
  )
}
