'use client'

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

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
 * Barra lateral de escritorio (D-131, D-132).
 *
 * Bajo `md` no existe: ahi manda la barra inferior (D-106) y este componente ni
 * se ve —`hidden md:flex`—. Nada de lo que hay aqui toca la navegacion del
 * telefono.
 *
 * REPARTO DE TAREAS. El ancho, los rellenos y los nombres de las opciones los
 * decide el CSS a partir de dos cosas: el atributo `data-sidebar` que sale de la
 * cookie y la consulta de medios de `globals.css`. Este componente solo aporta
 * lo que necesita JavaScript de verdad: los globos con el nombre de cada icono,
 * el boton que guarda la preferencia, y la superposicion.
 *
 * DOS FORMAS DE ABRIRLA, segun haya sitio o no (D-132):
 *
 *   HAY SITIO (>= 85rem)  el boton guarda la preferencia y la barra empuja al
 *                         contenido, como toda la vida.
 *   NO HAY SITIO          el boton la abre ENCIMA del contenido, flotando. Es
 *                         temporal: se cierra al elegir una opcion, al pulsar
 *                         fuera, con `Escape` o al sacar el foco de ella. NO
 *                         toca la preferencia guardada, porque no es una
 *                         eleccion sobre como quiere trabajar, es un vistazo.
 */
export function AppSidebar({ orgName, navItems, preference: initial }: AppSidebarProps) {
  const [preference, setPreference] = useState<SidebarPreference>(initial)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const aside = useRef<HTMLElement>(null)
  const hasRoom = useSyncExternalStore(subscribeToRoom, hasRoomNow, hasRoomOnServer)
  const collapsed = isSidebarCollapsed(preference, hasRoom, overlayOpen)

  const closeOverlay = useCallback(() => setOverlayOpen(false), [])

  const toggle = useCallback(() => {
    // Se pregunta por el sitio EN EL MOMENTO del clic, no se confia solo en el
    // valor suscrito: si el aviso de la consulta de medios se hubiera perdido,
    // el boton seguiria eligiendo bien entre empujar y flotar.
    if (!room().matches) {
      setOverlayOpen((open) => !open)
      return
    }

    setOverlayOpen(false)
    setPreference((current) => {
      const next: SidebarPreference = current === 'collapsed' ? 'expanded' : 'collapsed'
      document.cookie = sidebarCookie(next, window.location.protocol === 'https:')
      return next
    })
  }, [])

  /**
   * Cruzar el punto de corte cierra la superposicion.
   *
   * Si la ventana vuelve a dar de si, la barra ya cabe en su sitio y manda otra
   * vez la preferencia; dejarla flotando encima de un hueco que ya existe seria
   * absurdo. Se escucha el mismo `matchMedia` que el resto del componente —no
   * hay un `resize` nuevo— y se cierra en el aviso, no leyendo el estado en cada
   * render: asi no queda un `overlayOpen` en pie que reapareceria solo al volver
   * a estrechar la ventana.
   */
  useEffect(() => {
    const query = room()
    query.addEventListener('change', closeOverlay)
    return () => query.removeEventListener('change', closeOverlay)
  }, [closeOverlay])

  /**
   * Mientras flota: `Escape` cierra, y llevarse el foco fuera tambien.
   *
   * Lo segundo es para el teclado. Sin ello, quien tabula desde el ultimo
   * enlace entraria en el contenido —que esta detras de la capa y no se deja
   * pulsar— con la barra abierta encima y sin una forma evidente de cerrarla.
   *
   * Se escucha `focusin` en el DOCUMENTO y no `onBlur` en la barra porque asi
   * da igual como haya llegado el foco a su nuevo sitio —tabulador, clic o una
   * llamada a `focus()` desde otro componente— y no hace falta interpretar un
   * `relatedTarget` que a veces llega vacio.
   *
   * Esta rama **no se puede comprobar en el panel del navegador**: sin foco de
   * ventana, `focus()` cambia `document.activeElement` pero el navegador no
   * emite ni un evento de foco. Se comprueba con Playwright, que maneja una
   * ventana de verdad (`menu-lateral.spec.ts`).
   */
  useEffect(() => {
    if (!overlayOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOverlayOpen(false)
    }
    function onFocusIn(event: globalThis.FocusEvent) {
      const target = event.target
      if (target instanceof Node && aside.current?.contains(target)) return
      setOverlayOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [overlayOpen])

  return (
    // `delayDuration` propio: con el valor de la casa —0— basta rozar la barra
    // de iconos con el raton para ir dejando globos por el camino. 200 ms es el
    // tiempo de quien se detiene a leer uno.
    <TooltipProvider delayDuration={200}>
      {/* Las dos piezas que solo existen mientras la barra flota (D-132). */}
      {overlayOpen ? (
        <>
          {/*
            EL HUECO. Al salir del flujo, la barra deja de ocupar su columna y el
            contenido se correria 56 px a la izquierda al abrir, y otros 56 de
            vuelta al cerrar. Este hueco ocupa exactamente lo que ocupaba ella
            —`--sidebar-width`, que ahi vale 56 px— para que no se mueva nada.
          */}
          <div aria-hidden className="hidden w-[var(--sidebar-width)] shrink-0 md:block" />

          {/*
            LA CAPA. Recoge el clic de fuera —una de las cinco formas de
            cerrarla— y ademas dice a la vista que lo de debajo esta en pausa.
            `z-[45]` la deja por encima del encabezado —`z-40`— y por debajo de
            la barra —`z-50`—. No es un dialogo: sin `aria-modal` ni cepo de
            foco, porque esto es un menu que se asoma.
          */}
          <div
            aria-hidden
            onClick={closeOverlay}
            className="bg-foreground/20 fixed inset-0 z-[45] hidden md:block"
          />
        </>
      ) : null}

      {/*
        `data-sidebar` lleva LA PREFERENCIA, no el estado que se ve. Es
        deliberado: si llevara el estado efectivo, React estaria decidiendo
        tambien lo que ya decide la consulta de medios, y una barra cerrada por
        falta de sitio se quedaria clavada en 56 px hasta que React se enterase
        de que la ventana volvio a crecer. Diciendo solo «esta persona la quiere
        cerrada», del resto se encarga el CSS, que nunca llega tarde.
        `data-sidebar-overlay` es aparte a proposito: ese si es estado de
        cliente, temporal, y no viaja a ninguna cookie.

        `ps-[var(--safe-left)]`: la barra es una de las dos caras que tocan el
        borde de la pantalla (D-119). Vale 0 salvo en un telefono con muesca en
        horizontal, donde esta barra ni se muestra, asi que en la practica no
        cambia nada; se conserva por si algun dia cambia el punto de corte.
      */}
      <aside
        {...tourTarget('nav-sidebar')}
        data-sidebar={preference}
        data-sidebar-overlay={overlayOpen ? '' : undefined}
        ref={aside}
        className={[
          'bg-background hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r',
          'ps-[var(--safe-left)] md:flex',
          // La animacion del ancho es lo que evita el salto al abrir y cerrar.
          // Quien haya pedido menos movimiento al sistema no la recibe.
          'transition-[width] duration-200 ease-out motion-reduce:transition-none',
          // Flotando: fuera del flujo, pegada al borde y de alto completo, con
          // sombra para que se lea como una capa y no como parte de la pagina.
          overlayOpen ? 'fixed inset-y-0 start-0 z-50 shadow-xl' : '',
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
          <SidebarToggle collapsed={collapsed} onToggle={toggle} />
        </div>

        <div id={NAV_ID} className="flex-1 overflow-y-auto p-[var(--sidebar-padding)]">
          {/*
            `onNavigate` cierra la superposicion al elegir una opcion (D-132).
            Cuando la barra no flota no hay nada que cerrar y no hace nada.
          */}
          <NavLinks items={navItems} collapsed={collapsed} onNavigate={closeOverlay} />
        </div>
      </aside>
    </TooltipProvider>
  )
}

type SidebarToggleProps = {
  collapsed: boolean
  onToggle: () => void
}

/**
 * El boton que abre y cierra la barra.
 *
 * SIEMPRE HACE ALGO (D-132). Hasta el 2026-08-28 se quedaba inerte cuando la
 * ventana no daba para la barra abierta, con un globo que lo explicaba; el
 * dueño pidio lo contrario, y tiene razon: un boton que no actua es un boton
 * roto por mucho que se disculpe. Ahora, donde no cabe, la abre encima del
 * contenido.
 *
 * DOS TEXTOS, NO TRES. Da igual si va a empujar el contenido o a flotar sobre
 * el: la accion es la misma —abrir el menu— y se llama igual. Un tercer texto
 * para el mismo boton obligaria a la persona a entender una diferencia que la
 * pantalla ya le esta enseñando.
 */
function SidebarToggle({ collapsed, onToggle }: SidebarToggleProps) {
  const action = collapsed ? 'Abrir el menú' : 'Cerrar el menú'

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
        {action}
      </TooltipContent>
    </Tooltip>
  )
}
