/**
 * La celda «Boleta» de las listas: los dos numeros y, debajo, cual es cual.
 *
 * Lo que se comprueba aqui es el DEFECTO P1-A de la auditoria visual: en modo
 * seleccion, el numero seguia siendo un enlace vivo. Tocarlo —el objetivo mas
 * grande de la tarjeta— abria el detalle en vez de marcar la boleta, y al
 * volver habia que entrar otra vez en «Seleccionar varias», porque
 * `selectionMode` es estado de React de la pantalla abandonada.
 *
 * LO MARCADO NO SE PERDIA. Vive en `sessionStorage` (`selection-store.ts`) y
 * sobrevive a la navegacion. El informe de la auditoria afirmo lo contrario;
 * queda corregido aqui y en D-211.
 *
 * `shouldActivateRow` hace bien su trabajo: un clic dentro de un `a[href]` no
 * activa la fila, porque ese enlace ya atiende su propio clic. El problema no
 * era la regla, era que en modo seleccion ese enlace no deberia existir: la
 * tarjeta ya no abre nada, igual que la flecha `RowChevron` desaparece porque
 * «prometeria algo que ya no ocurre» (D-108).
 *
 * Sin Testing Library, como el resto de pruebas de componente del proyecto:
 * `renderToStaticMarkup` basta para mirar el marcado.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { TicketNumbersCell, TicketNumbersLink } from '@/features/tickets/components/TicketNumbers'

const boleta = { dailyNumber: '1234', weeklyNumber: '5678' }
const href = '/seller/tickets/abc'

describe('la celda «Boleta»', () => {
  it('fuera del modo seleccion es un enlace al detalle, con su nombre accesible', () => {
    const markup = renderToStaticMarkup(<TicketNumbersLink ticket={boleta} href={href} />)

    expect(markup).toContain('<a')
    expect(markup).toContain(href)
    expect(markup).toContain('Ver la boleta 1234 / 5678')
    expect(markup).toContain('1234 / 5678')
  })

  it('en modo seleccion NO es un enlace: la tarjeta marca, no abre', () => {
    const markup = renderToStaticMarkup(
      <TicketNumbersLink ticket={boleta} href={href} interactive={false} />,
    )

    // Lo importante: no queda ningun `a[href]` que consuma el toque ni que
    // prometa una navegacion que en este modo no ocurre.
    expect(markup).not.toContain('<a')
    expect(markup).not.toContain(href)
    expect(markup).not.toContain('Ver la boleta')
    // Los numeros siguen ahi: es como se nombra una boleta (BR-N11).
    expect(markup).toContain('1234 / 5678')
  })

  it('la celda completa propaga el modo a su enlace y conserva la leyenda', () => {
    const conEnlace = renderToStaticMarkup(<TicketNumbersCell ticket={boleta} href={href} />)
    const sinEnlace = renderToStaticMarkup(
      <TicketNumbersCell ticket={boleta} href={href} interactive={false} />,
    )

    expect(conEnlace).toContain('<a')
    expect(sinEnlace).not.toContain('<a')
    // La leyenda no depende del modo.
    expect(conEnlace).toContain('Diario · Semanal')
    expect(sinEnlace).toContain('Diario · Semanal')
  })

  it('sin uno de los dos numeros no escribe la leyenda, tambien en modo seleccion', () => {
    const markup = renderToStaticMarkup(
      <TicketNumbersCell
        ticket={{ dailyNumber: '1234', weeklyNumber: null }}
        href={href}
        interactive={false}
      />,
    )

    expect(markup).not.toContain('Diario · Semanal')
  })
})
