import { describe, expect, it } from 'vitest'

import * as forgotPassword from '@/app/(public)/forgot-password/page'
import * as offline from '@/app/offline/page'

/**
 * Las pantallas que necesitan JavaScript tienen que renderizarse POR PETICION
 * (I-070, D-121).
 *
 * POR QUE ESTA PRUEBA EXISTE, que es lo que hay que entender antes de tocarla:
 *
 * La CSP de este proyecto usa `'strict-dynamic'` con un nonce distinto en cada
 * peticion (D-061). Next solo puede poner ese nonce en los scripts cuando
 * renderiza la pagina EN la peticion; si la prerenderiza al construir, el HTML
 * sale sin nonce y el navegador **bloquea todos sus scripts**. La pantalla se ve
 * perfecta y no reacciona a nada.
 *
 * POR QUE NO LO CUBRE UNA PRUEBA E2E. El arnes de Playwright arranca
 * `npm run dev:local`, y en `next dev` **todo** se renderiza por peticion: la
 * pagina rota funcionaria alli sin problema. Es exactamente la razon por la que
 * `/forgot-password` estuvo rota en produccion desde la Fase 7 y la sobrevivio a
 * dos auditorias con 294 pruebas E2E en verde (I-074).
 *
 * QUE COMPRUEBA. Que no desaparezca el `export const dynamic` de las pantallas
 * que dependen de React. Es poco, pero es exactamente el fallo que ocurrio: no
 * hay nada en el codigo de la pagina que insinue que quitarlo la rompe.
 *
 * COMO SE AMPLIA. Cualquier pantalla PUBLICA nueva que monte un componente de
 * cliente —un formulario, un boton, un dialogo— se anade a esta lista. Las
 * pantallas protegidas no hacen falta: leen la sesion, asi que Next ya las
 * renderiza por peticion.
 */

const PANTALLAS_QUE_NECESITAN_JAVASCRIPT = [
  {
    ruta: '/forgot-password',
    modulo: forgotPassword,
    porQue: 'monta un formulario con react-hook-form y una Server Action',
  },
  {
    ruta: '/offline',
    modulo: offline,
    porQue: 'escucha la vuelta de la conexion para recargar sola',
  },
]

describe('pantallas publicas que dependen de JavaScript', () => {
  for (const { ruta, modulo, porQue } of PANTALLAS_QUE_NECESITAN_JAVASCRIPT) {
    it(`${ruta} se renderiza por peticion, porque ${porQue}`, () => {
      expect(modulo.dynamic).toBe('force-dynamic')
    })
  }
})
