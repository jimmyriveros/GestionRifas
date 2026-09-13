/**
 * Los trazos de cada icono de lucide, tal como los exporta su módulo (D-194).
 *
 * `lucide-react` no publica tipos para sus módulos por icono, y la imagen de
 * «Resultados de la semana» necesita justo eso: Satori no puede pintar los
 * componentes (son `forwardRef` con contexto de React), pero sí un `<svg>` hecho
 * con los mismos elementos. Cada módulo exporta `__iconNode`: la lista de
 * elementos SVG del icono, `[etiqueta, atributos]`.
 *
 * Solo se declara lo que se usa. La versión de `lucide-react` está fijada en
 * `package.json`, y `tests/unit/weekly-results-image.test.tsx` comprueba que
 * cada icono sigue trayendo sus trazos: si una actualización moviera esta ruta,
 * falla la prueba en vez de salir una tarjeta sin icono.
 */
declare module 'lucide-react/dist/esm/icons/*.mjs' {
  export const __iconNode: [elementName: string, attributes: Record<string, string>][]
}
