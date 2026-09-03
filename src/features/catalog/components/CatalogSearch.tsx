'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

import { SearchInput } from '@/features/search/components/SearchInput'
import { catalogSearchHint } from '@/features/search/hints'

import { useCatalogSticky } from '../sticky'

/**
 * El buscador del catalogo publico (BR-K08, D-164, D-165).
 *
 * SE PINTA EN DOS SITIOS Y NUNCA EN LOS DOS A LA VEZ: dentro del hero mientras
 * se vea, y dentro de la fila del encabezado cuando el del hero se pierda de
 * vista. Lo que NO se duplica es su estado: el termino, el debounce, `Enter`,
 * `Escape`, el reinicio de `page` y el indicador de carga salen de un unico
 * `useUrlSearch` que vive en `CatalogStickyProvider`. Este componente solo
 * pinta.
 *
 * EL FOCO Y EL CURSOR VIAJAN A MANO, y hace falta: mudarse de sitio en el DOM
 * es desmontar y volver a montar el `<input>`, y el navegador no puede recordar
 * el foco de un elemento que ha dejado de existir. Se guardan al desmontar y se
 * devuelven al montar (`handoff`). Sin eso, a quien esta escribiendo en un
 * telefono se le cierra el teclado a mitad de palabra.
 *
 * La consulta la sigue haciendo el servidor: el termino vive en la URL
 * (`?q=1300`) y el debounce retrasa la NAVEGACION, no un `fetch`, porque aqui
 * no hay ninguno. No se descarga el inventario para filtrarlo en el navegador.
 */
/**
 * `useLayoutEffect` en el navegador y `useEffect` en el servidor.
 *
 * NO ES UNA PRECAUCION DE ESTILO: el relevo del foco TIENE que ocurrir en la
 * fase de layout. La limpieza de un `useEffect` normal corre DESPUES de que
 * React haya quitado el nodo del documento, y para entonces
 * `document.activeElement` ya es el `<body>`: no hay foco que guardar. La de un
 * efecto de layout corre ANTES de desprenderlo, que es cuando todavia se puede
 * mirar. El envoltorio evita el aviso de React al renderizar en el servidor.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function CatalogSearch({ compact = false }: { compact?: boolean }) {
  const { search, handoff } = useCatalogSticky()
  const inputRef = useRef<HTMLInputElement>(null)

  useIsomorphicLayoutEffect(() => {
    const input = inputRef.current
    handoff.restore(input)
    return () => handoff.save(input)
  }, [handoff])

  return (
    <SearchInput
      label="Buscar número de boleta"
      hideLabel
      // En la fila del encabezado no cabe «Buscar número» sin recortarse a
      // media palabra; el nombre accesible sigue siendo el completo, que es lo
      // que se anuncia y por lo que se encuentra el campo (D-114).
      placeholder={compact ? 'Buscar' : 'Buscar número'}
      value={search.value}
      onChange={search.onChange}
      onSubmit={search.submitNow}
      onClear={search.clear}
      loading={search.showSpinner}
      // Teclado numerico en el telefono: lo unico que se escribe aqui son
      // cifras, y obligar a cambiar de teclado en cada busqueda es un toque de
      // mas en la pantalla que mas se usa.
      inputMode="numeric"
      touchSize={!compact}
      leadingIcon
      inputRef={inputRef}
      // En el encabezado, la pista NO reserva sitio: reservarlo haria crecer una
      // barra fija que esta en pantalla todo el rato, y crecer es justo lo que
      // reintroduce el parpadeo del observador. Se sigue anunciando.
      hintReservesSpace={!compact}
      className={
        compact
          ? '[&_input]:h-10 [&_input]:border-white/20 [&_input]:bg-white/[0.06]'
          : '[&_input]:border-white/20 [&_input]:bg-black/60 [&_input]:backdrop-blur-md md:[&_input]:h-11'
      }
      hint={catalogSearchHint(search.value) ?? search.hint}
    />
  )
}
