/**
 * Reglas de la fila seleccionable: cuando un clic dentro de una fila debe abrir
 * su detalle y cuando no.
 *
 * Vive aparte de `DataTable` porque es logica pura y comprobable sin navegador
 * (tests/unit/row-activation.test.ts), y porque cualquier otra lista que quiera
 * el mismo comportamiento debe usar estas mismas reglas en vez de reinventarlas.
 *
 * El caso dificil no es el clic normal, son los dos que se cuelan:
 *
 * 1. Un elemento con accion propia dentro de la fila (el enlace del codigo, la
 *    casilla de aprobacion, el boton «Ver»). Ese clic ya hace algo: la fila no
 *    debe hacerlo otra vez.
 * 2. Un menu de Radix. Su contenido se renderiza en un portal —fuera de la fila
 *    en el DOM— pero React propaga el evento por el arbol de componentes, asi
 *    que llega igual al `onClick` de la fila. Por eso no basta con mirar si el
 *    objetivo es interactivo: hay que comprobar antes que este dentro de la
 *    fila de verdad.
 */

/** Elementos que atienden su propio clic y por tanto lo consumen. */
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
  // Escotilla para cualquier caso que este selector no prevea.
  '[data-row-activation="ignore"]',
].join(', ')

/**
 * `true` cuando el clic ocurrio en una zona libre de la fila y debe abrir su
 * detalle.
 */
export function shouldActivateRow(target: EventTarget | null, row: Element): boolean {
  if (!(target instanceof Node)) return false

  // Fuera de la fila en el DOM: es un portal (menu, dialogo) que solo llega
  // hasta aqui por la propagacion de React.
  if (!row.contains(target)) return false

  if (!(target instanceof Element)) return true

  const interactive = target.closest(INTERACTIVE_SELECTOR)
  // Un elemento interactivo por encima de la fila no cuenta: lo que consume el
  // clic tiene que estar dentro de ella.
  return interactive === null || !row.contains(interactive)
}

/**
 * `true` si el usuario estaba seleccionando texto. Arrastrar para copiar un
 * numero de boleta termina en un `click`, y navegar entonces seria arrebatarle
 * al usuario lo que acaba de seleccionar.
 */
export function hasTextSelection(selection: Selection | null): boolean {
  return selection !== null && !selection.isCollapsed && selection.toString().trim() !== ''
}

/**
 * `true` para las teclas que activan una fila enfocada. `Space` acompana a
 * `Enter` porque la fila se comporta como un boton, no como un enlace.
 */
export function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar'
}
