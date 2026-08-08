/**
 * Un archivo que no se puede leer siquiera.
 *
 * Se distingue a proposito de los problemas POR FILA: aqui el archivo entero es
 * inservible —esta vacio, no es un CSV, el JSON esta roto— y no hay nada que
 * previsualizar. Un problema de fila, en cambio, se muestra en la tabla junto
 * a las filas que si sirven.
 *
 * El mensaje va escrito para quien sube el archivo, no para quien programa: se
 * muestra tal cual en pantalla.
 */
export class ImportParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportParseError'
  }
}
