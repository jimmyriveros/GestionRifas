'use client'

import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

import { ClientCreatedDialog, type ClientCreatedOutcome } from './ClientCreatedDialog'
import type { WhatsappSettings } from '../invite'

/**
 * El anfitrion del dialogo de exito, montado donde NADA lo puede desmontar
 * (BR-W06, D-179).
 *
 * POR QUE EXISTE, QUE ES LA PARTE QUE IMPORTA
 *
 * El dialogo vivia dentro de `AssignTicketDialog`, y `AssignTicketDialog` se
 * pinta asi en el detalle de la boleta:
 *
 *     {canAssign ? <AssignTicketDialog … /> : null}
 *     const canAssign = ticket.inventoryStatus === 'available' && …
 *
 * Al vender, `router.refresh()` vuelve a pedir la pagina al servidor, la boleta
 * ya no esta `available`, **`canAssign` pasa a `false`** y ese bloque
 * desaparece — con el dialogo de exito dentro y con su estado. El vendedor veia
 * el modal un instante y se le cerraba solo, sin haber decidido nada.
 *
 * D-176 ya habia movido el dialogo FUERA del formulario, para que sobreviviera
 * al cierre del formulario. La leccion de este defecto es que aquello subio
 * **un solo nivel**, y el nivel de encima tambien desaparecia: no basta con
 * sacarlo del componente que se cierra, hay que ponerlo donde no dependa de
 * ninguna condicion que la propia operacion vuelve falsa.
 *
 * DONDE SE MONTA: en el layout del portal del vendedor, que no se desmonta al
 * navegar entre sus pantallas ni al refrescar el arbol de servidor. Ninguna
 * condicion de negocio lo apaga.
 *
 * LA CONFIGURACION VIAJA CON EL AVISO, NO SE GUARDA AQUI. Es deliberado: si el
 * proveedor la leyera una vez al montarse, se quedaria vieja en cuanto el
 * vendedor guardara su grupo, y `saveWhatsappSettings` revalida las PANTALLAS,
 * no el layout. Asi cada pantalla manda la que acaba de recibir del servidor y
 * el dialogo nunca decide con un dato rancio.
 */

export type ClientCreatedPayload = {
  outcome: ClientCreatedOutcome
  settings: WhatsappSettings
  /**
   * A donde ir cuando el vendedor cierre. `undefined` = quedarse donde esta.
   *
   * Lo decide quien avisa, porque cada flujo termina en un sitio: desde «Mis
   * clientes» se va a la ficha del cliente reciEn creado; desde una boleta no
   * se va a ningun sitio, porque ya estamos mirando el resultado de la venta.
   */
  redirectTo?: string
}

/**
 * Avisa de que se creo un cliente. Fuera del portal del vendedor no hace nada:
 * ni el Dueño ni el Administrador crean clientes (`createClientRecord` y
 * `assignTicketsToNewClient` son `authorizeAction(['seller'])`), asi que un
 * proveedor ausente es el caso normal y no un error.
 */
const ClientCreatedContext = createContext<(payload: ClientCreatedPayload) => void>(() => {})

export function useClientCreated() {
  return useContext(ClientCreatedContext)
}

export function ClientCreatedProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [payload, setPayload] = useState<ClientCreatedPayload | null>(null)

  /**
   * Estable a proposito: lo consumen formularios que se re-renderizan en cada
   * pulsacion, y una funcion nueva en cada render los haria re-renderizar de
   * balde.
   */
  const show = useCallback((next: ClientCreatedPayload) => setPayload(next), [])

  return (
    <ClientCreatedContext.Provider value={show}>
      {children}
      {/*
        EL UNICO SITIO QUE APAGA ESTE DIALOGO ES `onClose`, y `onClose` solo lo
        llama un boton. No hay temporizador, ni cierre automatico, ni efecto que
        lo baje: `payload` se pone al crear el cliente y se quita cuando la
        persona decide (BR-W06).
      */}
      {payload ? (
        <ClientCreatedDialog
          outcome={payload.outcome}
          settings={payload.settings}
          onClose={() => {
            setPayload(null)
            if (payload.redirectTo) router.push(payload.redirectTo)
            // El arbol de servidor se refresca DESPUES de cerrar, nunca antes:
            // hacerlo antes es justo lo que desmontaba el dialogo (D-179).
            router.refresh()
          }}
        />
      ) : null}
    </ClientCreatedContext.Provider>
  )
}
