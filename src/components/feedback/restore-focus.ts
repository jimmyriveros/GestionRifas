/**
 * A donde vuelve el foco cuando se cierra una confirmacion (I-152).
 *
 * Vive aparte de `ConfirmDialog` porque es logica pura y comprobable sin
 * navegador (tests/unit/restore-focus.test.ts), igual que `row-activation.ts`.
 *
 * EL PROBLEMA. `ConfirmDialog` se usa CONTROLADO —`open` / `onOpenChange`— y
 * sin `AlertDialogTrigger`, asi que Radix no tiene ninguna referencia a la que
 * devolver el foco al cerrar y lo deja en `body`. Medido: quien cierra con
 * Escape aparece al principio del documento y tiene que recorrer la pagina
 * entera para volver al boton que acaba de pulsar (WCAG 2.4.3).
 *
 * POR QUE NO BASTA CON GUARDAR EL BOTON. Los usos no se comportan igual, y por
 * eso la regla mira el estado del elemento y no quien lo abrio:
 *
 *   * `ClientArchiveButton` o «Generar filas»: el mismo boton sigue ahi al
 *     cerrar —a lo sumo cambia su texto—, asi que volver a el es lo correcto.
 *   * `TicketActions`: «Anular boleta» se pinta con `{canCancel ? … : null}`.
 *     Al confirmar, la boleta pasa a anulada y el boton DESAPARECE: devolver el
 *     foco ahi seria devolverlo a un elemento que ya no existe.
 *   * `UserRowActions`: abre desde un `DropdownMenuItem`, que para entonces ya
 *     se desmonto. Pero el menu de Radix devuelve el foco a su disparador —el
 *     boton «⋯»— ANTES de que el dialogo se abra, de modo que lo que se captura
 *     es ese boton, que si sobrevive. Por eso se lee el foco al ABRIR y no se
 *     guarda el elemento al construir el dialogo.
 */

/** Un elemento sirve como destino si sigue en la pagina y puede recibir foco. */
function isUsable(element: HTMLElement | null): element is HTMLElement {
  if (element === null) return false
  if (!element.isConnected) return false
  // Un control deshabilitado no toma el foco: `focus()` no haria nada y el
  // usuario se quedaria igual de perdido que con `body`.
  if (element.hasAttribute('disabled')) return false
  if (element.getAttribute('aria-hidden') === 'true') return false
  return true
}

/**
 * El destino del foco al cerrar, o `null` para no tocar nada.
 *
 * `fallback` es el contenido de la pantalla —`<main>`— y solo entra en juego
 * cuando el control original ya no existe. No es un adorno: sin el, el caso de
 * «Anular boleta» volveria a dejar el foco en `body`.
 */
export function focusTargetAfterClose(
  opener: HTMLElement | null,
  fallback: HTMLElement | null,
): HTMLElement | null {
  if (isUsable(opener)) return opener
  if (isUsable(fallback)) return fallback
  return null
}

/**
 * Enfoca sin dejar rastro en el HTML.
 *
 * Un `<main>` no es enfocable por si mismo, asi que hay que prestarle
 * `tabindex="-1"` y retirarselo en cuanto pierde el foco: dejarlo puesto
 * cambiaria el documento de forma permanente por una interaccion puntual.
 *
 * SOLO a quien no es enfocable de nacimiento. Un `<button>` no lleva el
 * atributo pero su `tabIndex` ya vale 0, y ponerle `tabindex="-1"` lo SACARIA
 * del orden de tabulacion mientras tuviera el foco: al volver de un dialogo,
 * Shift+Tab dejaria de encontrarlo. Lo detecto la prueba unitaria.
 */
export function restoreFocus(target: HTMLElement, fallback: HTMLElement | null = null): void {
  const needsTabIndex = target.tabIndex < 0 && !target.hasAttribute('tabindex')

  if (needsTabIndex) {
    target.setAttribute('tabindex', '-1')
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true })
  }

  /*
   * EL ABRIDOR PUEDE DESAPARECER DESPUES, y por eso no basta con mirar si
   * sigue conectado al cerrar.
   *
   * «Anular boleta» sigue en la pantalla en ese instante: la accion ya
   * respondio, pero el arbol de servidor se vuelve a pintar con `router
   * .refresh()` un rato despues, y es entonces cuando `canCancel` pasa a false
   * y el boton se va. Al quitar un elemento enfocado, el navegador manda el
   * foco a `body` —justo lo que I-152 venia a evitar—.
   *
   * El rescate se engancha al `blur`, que tambien se dispara al quitarlo, y
   * comprueba las dos cosas antes de actuar: que el elemento ya no esta y que
   * el foco acabo en `body`. Si la persona simplemente tabulo fuera, el
   * elemento sigue conectado y aqui no pasa nada.
   */
  if (fallback !== null && fallback !== target) {
    target.addEventListener(
      'blur',
      () => {
        queueMicrotask(() => {
          if (target.isConnected) return
          if (document.activeElement !== null && document.activeElement !== document.body) return
          if (!fallback.isConnected) return
          restoreFocus(fallback)
        })
      },
      { once: true },
    )
  }

  target.focus()
}
