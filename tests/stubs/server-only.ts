/**
 * Sustituto de `server-only` para las pruebas unitarias.
 *
 * El paquete real lanza al importarse fuera de un Server Component, de modo que
 * Vitest —que corre en jsdom— no puede cargar ningun modulo que lo importe,
 * aunque lo unico que se quiera probar sea logica pura.
 *
 * Sustituirlo aqui NO debilita la garantia real: la frontera la impone el build
 * de Next, que sigue fallando si un Client Component importa uno de esos
 * modulos. Esta pieza solo existe dentro de `vitest.config.mts`.
 */
export {}
