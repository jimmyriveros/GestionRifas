import type { AppRole } from '@/lib/constants'

/**
 * Recorrido guiado: configuracion central.
 *
 * Todo el texto que lee un usuario durante el recorrido vive AQUI, no repartido
 * por los componentes (docs/UX_COPY_GUIDELINES.md, anexo B). Para agregar,
 * quitar o reordenar un paso se edita este archivo y nada mas.
 */

/**
 * Vocabulario de elementos que un paso puede resaltar.
 *
 * Son atributos `data-tour` puestos en componentes COMPARTIDOS (PageHeader,
 * DataTable, los filtros, el AppShell), asi que la mayoria de las pantallas los
 * tiene sin escribir nada: por eso un mismo paso sirve en varias paginas.
 *
 * Nunca se usan selectores por clase, posicion o estructura del HTML: las
 * clases de Tailwind cambian con cualquier retoque visual y romperian el
 * recorrido en silencio.
 */
export type TourTarget =
  // Estructura, presente en los dos portales
  | 'nav-sidebar'
  | 'nav-mobile'
  | 'user-menu'
  | 'page-header'
  | 'page-actions'
  | 'filters'
  | 'data-table'
  // Paneles
  | 'financial-summary'
  | 'metrics-inventory'
  | 'metrics-collection'
  | 'quick-actions'
  | 'seller-summary'

/** Atributo para marcar un elemento. `<div {...tourTarget('filters')}>`. */
export function tourTarget(target: TourTarget) {
  return { 'data-tour': target }
}

export function tourSelector(target: TourTarget) {
  return `[data-tour="${target}"]`
}

export type TourStep = {
  /**
   * Identificador estable. No cambia aunque el paso se mueva de sitio, para que
   * se pueda citar desde una prueba o desde la documentacion.
   */
  id: string
  /**
   * Elemento a resaltar. Sin `target`, el paso se muestra centrado y sin foco:
   * asi funcionan el saludo y la despedida.
   */
  target?: TourTarget
  title: string
  body: string
  /** Lado preferido del globo. Si no cabe, se recoloca solo. */
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export type TourId =
  | 'owner-dashboard'
  | 'owner-tickets'
  | 'owner-sellers'
  | 'owner-payments'
  | 'seller-dashboard'
  | 'seller-tickets'
  | 'seller-clients'
  | 'seller-payments'

export type Tour = {
  id: TourId
  /** Ruta exacta en la que corre. `/owner/tickets/bulk` no dispara el de `/owner/tickets`. */
  path: string
  /** Quien lo ve. Un vendedor nunca recibe los pasos del portal administrativo. */
  roles: AppRole[]
  steps: TourStep[]
}

// ---------------------------------------------------------------------------
// Pasos reutilizables
//
// Los dos portales comparten la barra de navegacion y la despedida. Se escriben
// una vez y cada recorrido los compone, para no duplicar codigo ni texto entre
// roles. Lo que SI cambia entre roles es el resto del texto, porque un dueno y
// un vendedor no hacen lo mismo en la misma pantalla.
// ---------------------------------------------------------------------------

/**
 * La barra lateral solo existe en escritorio y el boton de menu solo en movil.
 * Se declaran los dos: el que no este visible se descarta al arrancar, sin
 * necesidad de preguntar por el tamano de la pantalla.
 */
function navigationSteps(items: string): TourStep[] {
  return [
    {
      id: 'nav-sidebar',
      target: 'nav-sidebar',
      side: 'right',
      title: 'Desde aquí llegas a todo',
      body: `En este menú están ${items}. Toca cualquiera para entrar.`,
    },
    {
      id: 'nav-mobile',
      target: 'nav-mobile',
      side: 'bottom',
      title: 'Tu menú está aquí',
      body: `Toca este botón para abrir el menú y moverte entre ${items}.`,
    },
  ]
}

/**
 * Donde volver a encontrar el recorrido. Solo va en los paneles, que son la
 * primera pantalla de cada portal: repetirlo en cada listado seria ruido.
 */
function helpStep(): TourStep {
  return {
    id: 'help',
    target: 'user-menu',
    side: 'bottom',
    title: 'Si quieres repasarlo',
    body: 'Abre este menú y elige «Ver recorrido guiado». Puedes hacerlo las veces que necesites.',
  }
}

/**
 * Cierre calido. Nunca lleva elemento, para que no lo descarte el filtro de
 * pasos: todo recorrido debe terminar diciendo que ya se puede empezar.
 */
function closingStep(): TourStep {
  return {
    id: 'closing',
    title: 'Ya puedes empezar',
    body: 'Eso es todo lo importante de esta pantalla. Cuando quieras repasarlo, abre tu menú arriba a la derecha y elige «Ver recorrido guiado».',
  }
}

/** Los filtros y la tabla se ven igual en las dos pantallas de boletas. */
function ticketFilterStep(body: string): TourStep {
  return { id: 'filters', target: 'filters', side: 'bottom', title: 'Encuentra una boleta', body }
}

// ---------------------------------------------------------------------------
// Recorridos
// ---------------------------------------------------------------------------

const OWNER_TOURS: Tour[] = [
  {
    id: 'owner-dashboard',
    path: '/owner/dashboard',
    roles: ['owner', 'admin'],
    steps: [
      ...navigationSteps('las rifas, las boletas, tus vendedores y los pagos'),
      {
        id: 'financial-summary',
        target: 'financial-summary',
        side: 'bottom',
        title: 'El dinero de la rifa',
        body: 'Lo vendido es a cuánto se comprometieron tus clientes; lo recaudado, lo que ya pagaron. El saldo pendiente es lo que falta por cobrar.',
      },
      {
        id: 'metrics-inventory',
        target: 'metrics-inventory',
        side: 'bottom',
        title: 'Cuántas boletas hay y cómo están',
        body: 'Las disponibles son las que todavía puedes repartir; las asignadas ya tienen cliente. Las pendientes de aprobación las creó un vendedor y esperan tu revisión.',
      },
      {
        id: 'metrics-collection',
        target: 'metrics-collection',
        side: 'top',
        title: 'Cómo va el pago de cada boleta',
        body: '«Sin pagar» significa que ese cliente no ha pagado nada; «Abonada», que pagó una parte; «Pagada», que ya completó el valor.',
      },
      {
        id: 'seller-summary',
        target: 'seller-summary',
        side: 'top',
        title: 'Cómo va cada vendedor',
        body: 'Compara aquí lo que vendió y lo que cobró cada persona. Toca un vendedor para ver su detalle.',
      },
      helpStep(),
      closingStep(),
    ],
  },
  {
    id: 'owner-tickets',
    path: '/owner/tickets',
    roles: ['owner', 'admin'],
    steps: [
      {
        id: 'create',
        target: 'page-actions',
        side: 'bottom',
        title: 'Crea las boletas de la rifa',
        body: 'Con «Crear en lote» generas hasta 1.000 boletas de una vez y las repartes a un vendedor. La opción individual sirve para casos sueltos.',
      },
      ticketFilterStep(
        'Escribe el número diario o el semanal, o filtra por rifa, vendedor y estado. El botón «Limpiar filtros» deja la lista como estaba.',
      ),
      {
        id: 'table',
        target: 'data-table',
        side: 'top',
        title: 'Todas las boletas de tu organización',
        body: 'Cada fila trae sus dos números, su vendedor y si ya está pagada. Toca una boleta para aprobarla, cambiarle el vendedor o anularla.',
      },
      closingStep(),
    ],
  },
  {
    id: 'owner-sellers',
    path: '/owner/sellers',
    roles: ['owner', 'admin'],
    steps: [
      {
        id: 'invite',
        target: 'page-actions',
        side: 'bottom',
        title: 'Invita a un vendedor',
        body: 'Le llega un correo para que cree su propia contraseña. Tú nunca tienes que escribirle una.',
      },
      {
        id: 'table',
        target: 'data-table',
        side: 'top',
        title: 'Cómo va cada vendedor',
        body: 'Aquí ves cuántas boletas tiene, cuánto vendió y cuánto le falta por cobrar. Toca su fila para entrar a su detalle y asignarle boletas.',
      },
      closingStep(),
    ],
  },
  {
    id: 'owner-payments',
    path: '/owner/payments',
    roles: ['owner', 'admin'],
    steps: [
      {
        id: 'filters',
        target: 'filters',
        side: 'bottom',
        title: 'Encuentra un abono',
        body: 'Filtra por vendedor, por método de pago o por un rango de fechas para revisar lo que se cobró.',
      },
      {
        id: 'table',
        target: 'data-table',
        side: 'top',
        title: 'Todos los abonos registrados',
        body: 'Si uno quedó mal, entra a su detalle y anúlalo indicando el motivo. Los saldos se recalculan solos y el abono anulado queda en el historial.',
      },
      closingStep(),
    ],
  },
]

const SELLER_TOURS: Tour[] = [
  {
    id: 'seller-dashboard',
    path: '/seller/dashboard',
    roles: ['seller'],
    steps: [
      ...navigationSteps('tus boletas, tus clientes y tus pagos'),
      {
        id: 'quick-actions',
        target: 'quick-actions',
        side: 'bottom',
        title: 'Lo que más vas a usar',
        body: '«Vender una boleta» te muestra las que tienes libres. «Nuevo cliente» guarda los datos de quien te compra, para no volver a escribirlos.',
      },
      {
        id: 'financial-summary',
        target: 'financial-summary',
        side: 'bottom',
        title: 'Cómo va tu cobranza',
        body: 'Lo vendido es a cuánto se comprometieron tus clientes; lo recaudado, lo que ya te pagaron. El saldo pendiente es lo que te falta por cobrar.',
      },
      {
        id: 'metrics-inventory',
        target: 'metrics-inventory',
        side: 'bottom',
        title: 'Tus boletas',
        body: 'Las disponibles son las que todavía puedes vender; las vendidas ya tienen cliente.',
      },
      {
        id: 'metrics-collection',
        target: 'metrics-collection',
        side: 'top',
        title: 'Cómo va el pago de tus boletas',
        body: '«Sin pagar» es la que no te han pagado nada; «Abonada», la que te dieron una parte; «Pagada», la que ya te completaron el valor.',
      },
      helpStep(),
      closingStep(),
    ],
  },
  {
    id: 'seller-tickets',
    path: '/seller/tickets',
    roles: ['seller'],
    steps: [
      ticketFilterStep(
        'Escribe el número diario o el semanal, o filtra por estado y por cliente. El botón «Limpiar filtros» deja la lista como estaba.',
      ),
      {
        id: 'table',
        target: 'data-table',
        side: 'top',
        title: 'Tus boletas y su estado',
        body: 'Toca una boleta disponible para vendérsela a un cliente. Si ya la vendiste, ahí mismo ves cuánto te deben por ella.',
      },
      closingStep(),
    ],
  },
  {
    id: 'seller-clients',
    path: '/seller/clients',
    roles: ['seller'],
    steps: [
      {
        id: 'create',
        target: 'page-actions',
        side: 'bottom',
        title: 'Guarda a quien te compra',
        body: 'Con el nombre y el teléfono es suficiente. Después puedes usar el mismo cliente cada vez que te compre otra boleta.',
      },
      {
        id: 'table',
        target: 'data-table',
        side: 'top',
        title: 'Tus clientes',
        body: 'Toca un cliente para ver sus boletas, lo que ya te pagó y lo que te queda por cobrarle.',
      },
      closingStep(),
    ],
  },
  {
    id: 'seller-payments',
    path: '/seller/payments',
    roles: ['seller'],
    steps: [
      {
        id: 'register',
        target: 'page-actions',
        side: 'bottom',
        title: 'Registra lo que te pagan',
        body: 'Escribe el valor que recibiste y repártelo entre las boletas de ese cliente. El saldo se actualiza solo.',
      },
      {
        id: 'table',
        target: 'data-table',
        side: 'top',
        title: 'Tu historial de abonos',
        body: 'Cada pago queda aquí con su fecha y su valor. Si alguno quedó mal, pídele a tu administrador que lo anule.',
      },
      closingStep(),
    ],
  },
]

export const TOURS: Tour[] = [...OWNER_TOURS, ...SELLER_TOURS]

/** Recorrido de una pantalla, si existe uno para esa ruta y ese rol. */
export function findTour(pathname: string, role: AppRole): Tour | null {
  return TOURS.find((tour) => tour.path === pathname && tour.roles.includes(role)) ?? null
}
