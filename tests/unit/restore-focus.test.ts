/**
 * A dónde vuelve el foco al cerrar una confirmación (I-152).
 *
 * El defecto medido: `ConfirmDialog` se usa controlado y sin
 * `AlertDialogTrigger`, así que Radix no tenía a quién devolver el foco y lo
 * dejaba en `body`. Quien cerraba con Escape aparecía al principio del
 * documento.
 *
 * Se prueba la REGLA, con nodos de jsdom, no el render del diálogo: lo que
 * puede romperse aquí es a quién se considera un destino válido.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { focusTargetAfterClose, restoreFocus } from '@/components/feedback/restore-focus'

function build() {
  document.body.innerHTML = `
    <main id="contenido">
      <button id="abridor" type="button">Anular boleta</button>
      <button id="apagado" type="button" disabled>Guardar</button>
      <button id="oculto" type="button" aria-hidden="true">Oculto</button>
      <button id="con-tabindex" type="button" tabindex="0">Otro</button>
    </main>
  `
  const q = (id: string) => document.getElementById(id) as HTMLElement
  return {
    main: q('contenido'),
    abridor: q('abridor'),
    apagado: q('apagado'),
    oculto: q('oculto'),
    conTabIndex: q('con-tabindex'),
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('el destino del foco al cerrar', () => {
  it('vuelve al control que abrió el diálogo, que es lo normal', () => {
    const { abridor, main } = build()
    expect(focusTargetAfterClose(abridor, main)).toBe(abridor)
  })

  it('si ese control ya no está en la página, usa el contenido', () => {
    const { abridor, main } = build()
    abridor.remove()

    // Es el caso de «Anular boleta»: al confirmar, `canCancel` pasa a false y
    // el botón desaparece. Devolver el foco ahí sería devolverlo a la nada.
    expect(focusTargetAfterClose(abridor, main)).toBe(main)
  })

  it('un control deshabilitado no sirve: no puede recibir el foco', () => {
    const { apagado, main } = build()
    expect(focusTargetAfterClose(apagado, main)).toBe(main)
  })

  it('un control oculto a la accesibilidad tampoco sirve', () => {
    const { oculto, main } = build()
    expect(focusTargetAfterClose(oculto, main)).toBe(main)
  })

  it('sin abridor —el diálogo se abrió sin foco previo— usa el contenido', () => {
    const { main } = build()
    expect(focusTargetAfterClose(null, main)).toBe(main)
  })

  it('sin destino posible devuelve null y no se toca nada', () => {
    const { abridor } = build()
    abridor.remove()
    expect(focusTargetAfterClose(abridor, null)).toBeNull()
    expect(focusTargetAfterClose(null, null)).toBeNull()
  })
})

describe('devolver el foco', () => {
  it('enfoca el control tal cual, sin tocar su HTML', () => {
    const { abridor } = build()
    restoreFocus(abridor)

    expect(document.activeElement).toBe(abridor)
    expect(abridor.hasAttribute('tabindex')).toBe(false)
  })

  it('al contenido le presta un tabindex y se lo quita al salir', () => {
    const { main, abridor } = build()

    restoreFocus(main)
    expect(document.activeElement).toBe(main)
    // Prestado, no regalado: mientras tiene el foco hace falta.
    expect(main.getAttribute('tabindex')).toBe('-1')

    abridor.focus()
    // En cuanto el foco se va, el documento vuelve a estar como estaba.
    expect(main.hasAttribute('tabindex')).toBe(false)
  })

  /**
   * OJO CON EL ENTORNO: jsdom **no** emite `blur` al quitar un elemento
   * enfocado; un navegador de verdad sí, y además manda el foco a `body`.
   * Aquí se despacha el `blur` a mano para ejercitar el rescate; que el
   * navegador lo dispare de verdad lo comprueba la E2E «anula una boleta
   * exigiendo motivo», donde el botón desaparece al refrescarse la pantalla.
   */
  it('si el control desaparece DESPUÉS, rescata el foco hacia el contenido', async () => {
    const { abridor, main } = build()

    // El caso de «Anular boleta»: al cerrar el diálogo el botón sigue ahí, y
    // se va más tarde, cuando se repinta el árbol de servidor.
    restoreFocus(abridor, main)
    expect(document.activeElement).toBe(abridor)

    abridor.remove()
    abridor.dispatchEvent(new FocusEvent('blur'))
    await Promise.resolve()
    await Promise.resolve()

    // Sin el rescate, quitar un elemento enfocado deja el foco en `body`.
    expect(document.activeElement).toBe(main)
  })

  it('si la persona simplemente tabula fuera, no se rescata nada', async () => {
    const { abridor, main, conTabIndex } = build()

    restoreFocus(abridor, main)
    conTabIndex.focus()
    abridor.dispatchEvent(new FocusEvent('blur'))
    await Promise.resolve()
    await Promise.resolve()

    // El botón sigue en la página: no hubo desmontaje y nadie debe moverse.
    expect(document.activeElement).toBe(conTabIndex)
  })

  it('no le cambia el tabindex a quien ya traía uno', () => {
    const { conTabIndex } = build()
    restoreFocus(conTabIndex)

    expect(document.activeElement).toBe(conTabIndex)
    expect(conTabIndex.getAttribute('tabindex')).toBe('0')
  })
})
