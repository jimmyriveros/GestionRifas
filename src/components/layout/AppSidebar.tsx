'use client'

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { useCallback, useState, useSyncExternalStore } from 'react'

import { NavLinks } from '@/components/layout/NavLinks'
import type { NavItem } from '@/components/layout/nav-items'
import {
  isSidebarCollapsed,
  SIDEBAR_ROOM_QUERY,
  sidebarCookie,
  type SidebarPreference,
} from '@/components/layout/sidebar-preference'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { tourTarget } from '@/features/tour/tours'

const NAV_ID = 'menu-lateral'

type AppSidebarProps = {
  orgName: string
  navItems: NavItem[]
  /** Lo que la persona eligio la ultima vez, leido de la cookie en el servidor. */
  preference: SidebarPreference
}

/**
 * ¿Cabe la barra abierta?
 *
 * Se pregunta con `matchMedia`, no escuchando `resize`: el navegador avisa una
 * sola vez, al cruzar los 85rem, en vez de en cada pixel que se arrastra el
 * borde de la ventana. La consulta se crea una vez por pestana.
 */
let roomQuery: MediaQueryList | null = null

function room(): MediaQueryList {
  roomQuery ??= window.matchMedia(SIDEBAR_ROOM_QUERY)
  return roomQuery
}

function subscribeToRoom(onChange: () => void) {
  const query = room()
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function hasRoomNow() {
  return room().matches
}

/**
 * En el servidor no se sabe el ancho de la ventana, asi que se responde «si
 * cabe». No produce ningun salto: lo que se VE lo decide el CSS, que si conoce
 * el ancho desde el primer pintado. Lo unico que depende de esta respuesta son
 * los globos de ayuda, que antes de hidratar no existen.
 */
function hasRoomOnServer() {
  return true
}

/**
 * Barra lateral de escritorio (D-131).
 *
 * Bajo `md` no existe: ahi manda la barra inferior (D-106) y este componente ni
 * se ve —`hidden md:flex`—. Nada de lo que hay aqui toca la navegacion del
 * telefono.
 *
 * REPARTO DE TAREAS. El ancho, los rellenos y los nombres de las opciones los
 * decide el CSS a partir de dos cosas: el atributo `data-sidebar` que sale de la
 * cookie y la consulta de medios de `globals.css`. Este componente solo aporta
 * lo que necesita JavaScript de verdad: los globos con el nombre de cada icono
 * y el boton que guarda la preferencia.
 */
export function AppSidebar({ orgName, navItems, preference: initial }: AppSidebarProps) {
  const [preference, setPreference] = useState<SidebarPreference>(initial)
  const hasRoom = useSyncExternalStore(subscribeToRoom, hasRoomNow, hasRoomOnServer)
  const collapsed = isSidebarCollapsed(preference, hasRoom)

  const toggle = useCallback(() => {
    // Se vuelve a preguntar por el sitio EN EL MOMENTO del clic, no se confia
    // solo en el valor suscrito: si por lo que fuera el aviso de la consulta de
    // medios se hubiera perdido, el boton seguiria sin poder abrir una barra
    // que no cabe, que es la unica regla que no puede fallar.
    if (!room().matches) return

    setPreference((current) => {
      const next: SidebarPreference = current === 'collapsed' ? 'expanded' : 'collapsed'
      document.cookie = sidebarCookie(next, window.location.protocol === 'https:')
      return next
    })
  }, [])

  return (
    // `delayDuration` propio: con el valor de la casa —0— basta rozar la barra
    // de iconos con el raton para ir dejando globos por el camino. 200 ms es el
    // tiempo de quien se detiene a leer uno.
    <TooltipProvider delayDuration={200}>
      {/*
        `data-sidebar` lleva LA PREFERENCIA, no el estado que se ve. Es
        deliberado: si llevara el estado efectivo, React estaria decidiendo
        tambien lo que ya decide la consulta de medios, y una barra cerrada por
        falta de sitio se quedaria clavada en 56 px hasta que React se enterase
        de que la ventana volvio a crecer. Diciendo solo «esta persona la quiere
        cerrada», del resto se encarga el CSS, que nunca llega tarde.

        `ps-[var(--safe-left)]`: la barra es una de las dos caras que tocan el
        borde de la pantalla (D-119). Vale 0 salvo en un telefono con muesca en
        horizontal, donde esta barra ni se muestra, asi que en la practica no
        cambia nada; se conserva por si algun dia cambia el punto de corte.
      */}
      <aside
        {...tourTarget('nav-sidebar')}
        data-sidebar={preference}
        className={[
          'bg-background hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r',
          'ps-[var(--safe-left)] md:flex',
          // La animacion del ancho es lo que evita el salto al abrir y cerrar.
          // Quien haya pedido menos movimiento al sistema no la recibe.
          'transition-[width] duration-200 ease-out motion-reduce:transition-none',
        ].join(' ')}
      >
        <div className="flex h-14 items-center [justify-content:var(--sidebar-content-justify)] gap-2 border-b px-[var(--sidebar-padding)]">
          {/*
            El nombre del negocio es un dato, `organizations.name` (D-126). Con
            la barra cerrada no cabe y pasa a `sr-only`: se sigue oyendo, no se
            pierde.

            `title`: el boton se lleva 44 px de esta fila, asi que un nombre
            largo se recorta antes que con la barra de 256 px de antes. Se
            resuelve como el nombre del cliente en la tabla de boletas (D-130):
            lo que no cabe se lee al pasar el raton por encima.
          */}
          <span
            data-slot="sidebar-label"
            title={orgName}
            className="min-w-0 flex-1 truncate font-semibold"
          >
            {orgName}
          </span>
          <SidebarToggle collapsed={collapsed} hasRoom={hasRoom} onToggle={toggle} />
        </div>

        <div id={NAV_ID} className="flex-1 overflow-y-auto p-[var(--sidebar-padding)]">
          <NavLinks items={navItems} collapsed={collapsed} />
        </div>
      </aside>
    </TooltipProvider>
  )
}

type SidebarToggleProps = {
  collapsed: boolean
  hasRoom: boolean
  onToggle: () => void
}

/**
 * El boton que abre y cierra la barra.
 *
 * CUANDO NO CABE ABIERTA se queda a la vista, pero no actua: `aria-disabled` en
 * vez de `disabled` para que siga recibiendo el foco y se pueda leer el globo
 * que explica por que. Un boton que desaparece deja a la persona sin saber que
 * el menu se puede abrir; uno que no hace nada y no explica nada, peor.
 *
 * No se ofrece «abrirla encima del contenido» como tercera via: seria un cuarto
 * menu —lateral, inferior, menu de usuario— para una situacion que se resuelve
 * ensanchando la ventana o leyendo el globo de cada icono.
 */
function SidebarToggle({ collapsed, hasRoom, onToggle }: SidebarToggleProps) {
  const action = collapsed ? 'Abrir el menú' : 'Cerrar el menú'
  const hint = hasRoom ? action : 'No hay espacio para abrir el menú. Amplía la ventana.'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={action}
          aria-expanded={!collapsed}
          aria-controls={NAV_ID}
          aria-disabled={hasRoom ? undefined : true}
          onClick={onToggle}
        >
          {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
        </Button>
      </TooltipTrigger>
      {/*
        `pointer-events-none`: el globo sale hacia el contenido y no debe
        interponerse entre el raton y lo que hay debajo.
      */}
      <TooltipContent side="right" className="pointer-events-none">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}
