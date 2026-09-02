'use client'

import { SearchInput } from '@/features/search/components/SearchInput'
import { catalogSearchHint } from '@/features/search/hints'
import { useUrlSearch } from '@/features/search/use-url-search'

/**
 * El buscador del catalogo publico (BR-K08).
 *
 * ES EL UNICO JAVASCRIPT DE LA PAGINA, junto al refresco al volver del foco.
 * Todo lo demas —la reja, las tarjetas, el encabezado fijo, la paginacion— se
 * pinta en el servidor.
 *
 * SE REUTILIZAN `useUrlSearch` y `SearchInput` tal cual, que es lo que hace que
 * este campo se comporte igual que los otros cinco del proyecto: el termino
 * vive en la URL (`?q=1300`), el debounce retrasa la NAVEGACION —no un `fetch`,
 * porque aqui no hay ninguno—, `Enter` se salta la espera y `Escape` limpia. La
 * consulta la sigue haciendo el servidor: no se descarga el inventario para
 * filtrarlo aqui.
 *
 * `resetParams: ['page']` es lo que devuelve la lista a la primera pagina al
 * cambiar el termino; sin el, buscar desde la pagina 3 mostraria un hueco.
 *
 * MINIMO DE UNA CIFRA, no las dos de `SEARCH_MIN_CHARS.tickets`: «7» es una
 * busqueda legitima y completa de un numero de boleta, y aqui no hay nombres de
 * cliente que puedan devolver media tabla.
 */

const CATALOG_SEARCH_MIN_CHARS = 1

export function CatalogSearch() {
  const search = useUrlSearch({
    minChars: CATALOG_SEARCH_MIN_CHARS,
    resetParams: ['page'],
  })

  return (
    <SearchInput
      label="Buscar número de boleta"
      hideLabel
      placeholder="Buscar número"
      value={search.value}
      onChange={search.onChange}
      onSubmit={search.submitNow}
      onClear={search.clear}
      loading={search.showSpinner}
      // Teclado numerico en el telefono: lo unico que se escribe aqui son
      // cifras, y obligar a cambiar de teclado en cada busqueda es un toque de
      // mas en la pantalla que mas se usa.
      inputMode="numeric"
      touchSize
      // La lupa dentro del campo (D-163). Aqui el buscador flota sobre la
      // ilustracion y no lleva etiqueta visible: sin la lupa parece una caja
      // decorativa mas del hero.
      leadingIcon
      // El campo se posa sobre la composicion del vehiculo: necesita fondo
      // propio para que lo escrito se lea, y conserva sus 44 px tactiles
      // TAMBIEN en escritorio, donde es el elemento principal del hero.
      className="[&_input]:border-white/20 [&_input]:bg-black/60 [&_input]:backdrop-blur-md md:[&_input]:h-11"
      hint={catalogSearchHint(search.value) ?? search.hint}
    />
  )
}
