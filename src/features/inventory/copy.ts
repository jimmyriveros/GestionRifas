/**
 * TODOS los textos del inventario comun, del generador y de los apartados
 * (D-257). Juntos, por la misma razon que `search/hints.ts` o
 * `settlements/copy.ts`: un termino se escribe una sola vez o acaban siendo tres
 * (`UX_COPY_GUIDELINES`, Anexo B).
 *
 * Los terminos son los del glosario (Anexo A): **inventario comun**, **asignar a
 * un vendedor**, **recuperar**, **apartar** (la boleta queda **apartada**; cada
 * vez, un **apartado**), **30 minutos mas**, **devolver** y **cupo**. Nunca
 * «reservar», que el catalogo publico prohibe a proposito: alli nada se aparta,
 * y sigue sin apartarse (BR-K09).
 *
 * PURO: lo importan componentes de cliente, acciones y pruebas.
 */

import { formatTimeEs } from '@/lib/dates'
import { numberGroupTitle } from '@/lib/ticket-number-format'

import { formatCount, HOLD_EXTENSION_MINUTES, type InventoryAvailability } from './rules'

function boletas(count: number): string {
  return count === 1 ? '1 boleta' : `${formatCount(count)} boletas`
}

function apartadas(count: number): string {
  return count === 1 ? '1 boleta apartada' : `${formatCount(count)} boletas apartadas`
}

function numeros(count: number): string {
  return count === 1 ? '1 número' : `${formatCount(count)} números`
}

function cifras(width: number): string {
  return width === 1 ? '1 cifra' : `${width} cifras`
}

export const INVENTORY_COPY = {
  // -------------------------------------------------------------------------
  // El generador (personal)
  // -------------------------------------------------------------------------
  generator: {
    title: 'Generar boletas por rangos',
    description:
      'Crea todas las boletas de un rango de números —o todas las combinaciones de dos rangos, si la rifa tiene dos números—. Quedan en el inventario común de la rifa, sin vendedor.',
    modeWrite: 'Escribir los números',
    modeGenerate: 'Generar por rangos',
    modeLabel: 'Cómo quieres crear las boletas',
    raffleLabel: 'Rifa',
    rafflePlaceholder: 'Elige una rifa',
    fromLabel: 'Desde',
    toLabel: 'Hasta',
    /**
     * D-261: el ancho lo da el número de la rifa, no lo escrito. Se enseña con
     * un ejemplo de SU número, porque es lo único que no se ve en el campo.
     */
    groupWidthHint: (name: string, digits: number) =>
      `Cada número sale con las cifras de la rifa: «${name}» tiene ${digits}, así que del 0 al 5 crea ${'0'.repeat(digits)}, ${'1'.padStart(digits, '0')}, … ${'5'.padStart(digits, '0')}.`,
    /** «Número diario», «Número mayor»: el título del número en toda la aplicación. */
    groupLegend: (name: string) => numberGroupTitle(name),
    groupFromExample: (digits: number) => `Ejemplo: ${'0'.repeat(digits)}`,
    groupToExample: (digits: number) => `Ejemplo: ${'9'.repeat(digits)}`,
    calculate: 'Calcular',
    calculating: 'Calculando…',
    tooMany: (total: number, max: number) =>
      `Esos rangos dan ${formatCount(total)} combinaciones. El generador crea hasta ${formatCount(max)} de una vez: acorta uno de los dos rangos.`,
    // El titulo cuenta lo que se va a CREAR, que es lo que dice el boton; el
    // total de combinaciones va en el aviso de las que ya existen (D-172: un
    // rotulo y su desglose suman lo mismo).
    previewTitle: (toCreate: number) =>
      toCreate === 0
        ? 'No hay boletas nuevas que crear'
        : toCreate === 1
          ? 'Se creará 1 boleta'
          : `Se crearán ${formatCount(toCreate)} boletas`,
    previewRange: (label: string, from: string, to: string, count: number, width: number) =>
      `${label}: del ${from} al ${to} (${numeros(count)} de ${cifras(width)}).`,
    previewSample: 'Así quedan las primeras y las últimas:',
    previewDestination: (raffleName: string) =>
      `Quedan en el inventario común de ${raffleName}. Ningún vendedor las tendrá hasta que se las asignes.`,
    previewExisting: (existing: number, total: number) =>
      existing >= total
        ? total === 1
          ? 'Esa combinación ya existe en la rifa.'
          : `Las ${formatCount(total)} combinaciones ya existen en la rifa.`
        : existing === 1
          ? `De las ${formatCount(total)} combinaciones, 1 ya existe en la rifa: no se crea otra vez.`
          : `De las ${formatCount(total)} combinaciones, ${formatCount(existing)} ya existen en la rifa: no se crean otra vez.`,
    previewExistingGenerated: (count: number) =>
      count === 1
        ? 'De ellas, 1 la creó una generación anterior.'
        : `De ellas, ${formatCount(count)} las creó una generación anterior.`,
    previewInProgress:
      'Ya hay una generación igual sin terminar. Al confirmar, continúa desde donde quedó en vez de empezar otra.',
    confirm: (total: number) => `Generar ${boletas(total)}`,
    progress: (processed: number, total: number) =>
      `Generando… ${formatCount(processed)} de ${formatCount(total)}`,
    progressLabel: 'Avance de la generación',
    keepOpen:
      'Deja esta pantalla abierta hasta que termine. Si se interrumpe, lo ya creado se conserva y podrás continuar.',
    done: (created: number) =>
      created === 1
        ? 'Se creó 1 boleta en el inventario común.'
        : `Se crearon ${formatCount(created)} boletas en el inventario común.`,
    doneExisting: (existing: number) =>
      existing === 1
        ? '1 combinación ya existía y no se tocó.'
        : `${formatCount(existing)} combinaciones ya existían y no se tocaron.`,
    interrupted: (created: number, processed: number, total: number) =>
      `La generación se detuvo en ${formatCount(processed)} de ${formatCount(total)} combinaciones. Lo ya creado (${boletas(created)}) se conserva: puedes continuarla desde donde quedó.`,
    startFailed: 'No pudimos empezar la generación. Vuelve a intentarlo.',
    continueFailed: 'No pudimos continuar la generación. Vuelve a intentarlo.',
    stalled: 'La generación no avanzó. Vuelve a intentarlo en unos segundos.',
    connectionLost:
      'Se perdió la conexión mientras se generaban las boletas. Lo ya creado se conserva: vuelve a intentarlo para continuar.',
    continue: 'Continuar generación',
    viewInventory: 'Ver el inventario común',
    newGeneration: 'Generar otras',
    runsTitle: 'Generaciones recientes',
    runsEmpty: 'Todavía no has generado boletas por rangos.',
    runInProgress: 'Sin terminar',
    runCompleted: 'Terminada',
    /**
     * Los rangos de una generación, con los nombres de los números de SU rifa
     * (D-261); con uno solo, un solo rango.
     */
    runRanges: (
      names: readonly string[],
      dailyFrom: string,
      dailyTo: string,
      weeklyFrom: string | null,
      weeklyTo: string | null,
    ) =>
      weeklyFrom === null || weeklyTo === null
        ? `${names[0] ?? 'Diario'} ${dailyFrom}–${dailyTo}`
        : `${names[0] ?? 'Diario'} ${dailyFrom}–${dailyTo} · ${names[1] ?? 'Semanal'} ${weeklyFrom}–${weeklyTo}`,
    runCounts: (processed: number, total: number, created: number) =>
      `${formatCount(processed)} de ${formatCount(total)} revisadas · ${formatCount(created)} creadas`,
    runOpen: 'Ver generación',
    runTitle: 'Generación por rangos',
    existingTitle: 'Las que ya existían',
    existingDescription:
      'Combinaciones de estos rangos que no creó esta generación. Se dejaron como estaban.',
    existingOtherGeneration: 'La creó otra generación',
    existingOtherWay: 'Ya existía',
    existingEmpty: 'Ninguna combinación de estos rangos existía antes.',
    noRaffles: 'No hay rifas que admitan boletas nuevas',
    noRafflesDescription:
      'Solo se generan boletas en una rifa en borrador o activa. Crea una rifa o reactiva la que necesites.',
  },

  // -------------------------------------------------------------------------
  // El inventario comun en el portal administrativo
  // -------------------------------------------------------------------------
  staff: {
    custodyLabel: 'Inventario',
    custodyAll: 'Todo el inventario',
    custodyOptions: {
      common: 'En el inventario común',
      held: 'Apartadas por un vendedor',
      seller: 'Con un vendedor',
    },
    commonInventory: 'Inventario común',
    heldBy: (name: string) => `Apartada por ${name}`,
    heldUntil: (name: string, expiresAt: string) =>
      `Apartada por ${name} hasta las ${formatTimeEs(expiresAt)}`,
    summaryTitle: 'Inventario común',
    summaryFree: 'Libres',
    summaryHeld: 'Apartadas ahora',
    // Las tres cifras suman las «Disponibles» de la rifa (D-172).
    summaryWithSellers: 'Con vendedores, sin vender',
    generate: 'Generar boletas',
    viewCommon: 'Ver el inventario común',
    assignAction: 'Asignar a un vendedor',
    assignTitle: 'Asignar a un vendedor',
    assignDescription:
      'Las boletas pasan del inventario común al vendedor que elijas. No vencen: las tendrá hasta que las venda o las recuperes.',
    assignSellerLabel: 'Vendedor',
    assignSellerPlaceholder: 'Elige un vendedor',
    assignConfirm: (count: number) => `Asignar ${boletas(count)}`,
    assignDone: (count: number) =>
      count === 1
        ? 'La boleta fue asignada al vendedor.'
        : `Se asignaron ${boletas(count)} al vendedor.`,
    recoverAction: 'Recuperar al inventario común',
    recoverTitle: 'Recuperar al inventario común',
    recoverDescription:
      'Las boletas vuelven al inventario común y su vendedor deja de tenerlas. Solo se recuperan boletas disponibles, sin vender: ninguna venta, cliente ni abono cambia.',
    recoverConfirm: (count: number) => `Recuperar ${boletas(count)}`,
    recoverDone: (count: number) =>
      count === 1
        ? 'La boleta volvió al inventario común.'
        : `${boletas(count)} volvieron al inventario común.`,
  },

  // -------------------------------------------------------------------------
  // La configuracion de los apartados de una rifa (el Dueño)
  // -------------------------------------------------------------------------
  settings: {
    title: 'Apartados de los vendedores',
    duration: (minutes: number) =>
      `Cada apartado dura ${minutes} minutos y se puede pedir una vez ${HOLD_EXTENSION_MINUTES} minutos más.`,
    maxActive: (max: number) =>
      max === 0
        ? 'Los vendedores no pueden apartar boletas en esta rifa.'
        : max === 1
          ? 'Cada vendedor puede tener 1 boleta apartada a la vez en esta rifa.'
          : `Cada vendedor puede tener hasta ${max} boletas apartadas a la vez en esta rifa.`,
    onlyOwner: 'Solo el dueño cambia estos valores.',
    change: 'Cambiar',
    changeSubject: 'los apartados de esta rifa',
    dialogTitle: 'Apartados de los vendedores',
    dialogDescription:
      'Los cambios valen para los apartados nuevos. Los que ya están en curso conservan su hora de vencimiento.',
    durationLabel: 'Duración del apartado, en minutos',
    durationHint: 'Entre 5 y 180 minutos.',
    maxActiveLabel: 'Cupo por vendedor',
    maxActiveHint:
      'Cuántas boletas puede tener apartadas a la vez cada vendedor. Con 0, nadie puede apartar.',
    lowerCapNote:
      'Si alguien ya tiene más apartadas que el cupo nuevo, las conserva; solo no podrá apartar otras hasta quedar por debajo.',
    save: 'Guardar cambios',
    saving: 'Guardando…',
    saved: 'Los cambios fueron guardados.',
  },

  // -------------------------------------------------------------------------
  // El catalogo interno del vendedor
  // La hora de `formatTimeEs` ya termina en «p. m.»: detrás no va otro punto.
  // -------------------------------------------------------------------------
  seller: {
    navLabel: 'Inventario común',
    title: 'Inventario común',
    description: (minutes: number) =>
      `Busca una boleta libre de la rifa y apártala mientras la vendes. Cada apartado dura ${minutes} minutos.`,
    raffleLabel: 'Rifa',
    holdsTitle: 'Tus apartados',
    holdsCount: (active: number, max: number) =>
      max === 0
        ? 'En esta rifa no se pueden apartar boletas por ahora.'
        : `Tienes ${active} de ${max} ${max === 1 ? 'boleta apartada' : 'boletas apartadas'}.`,
    holdsEmpty: 'No tienes boletas apartadas en esta rifa.',
    capReached: (active: number, max: number) =>
      active > max
        ? `Tienes ${apartadas(active)} y el máximo de esta rifa ahora es ${max}. Vende o devuelve alguna para poder apartar otra.`
        : `Ya tienes ${apartadas(active)}, que es el máximo. Vende o devuelve alguna para apartar otra.`,
    expiresAt: (iso: string) => `Vence a las ${formatTimeEs(iso)}`,
    minutesLeft: (minutes: number) =>
      minutes <= 0 ? 'Venció' : minutes === 1 ? 'Queda 1 minuto' : `Quedan ${minutes} minutos`,
    expired: 'El apartado venció. Si la boleta sigue libre, puedes volver a apartarla.',
    sell: 'Vender',
    ticketSubject: (numbers: string) => ` la boleta ${numbers}`,
    extendSubject: (numbers: string) => ` para la boleta ${numbers}`,
    sellTitle: (numbers: string) => `Vender la boleta ${numbers}`,
    sellDescription:
      'Elige el cliente que la compró. Al guardar, la boleta pasa a tus boletas y el apartado termina.',
    extend: `Pedir ${HOLD_EXTENSION_MINUTES} minutos más`,
    extending: 'Pidiendo…',
    extended: `Ya pediste los ${HOLD_EXTENSION_MINUTES} minutos más.`,
    extendedDone: (iso: string) => `El apartado ahora vence a las ${formatTimeEs(iso)}`,
    return: 'Devolver',
    returning: 'Devolviendo…',
    returnTitle: (numbers: string) => `Devolver la boleta ${numbers}`,
    returnDescription:
      'Vuelve al inventario común y cualquier vendedor la puede apartar, tú también.',
    returnConfirm: 'Devolver boleta',
    returned: 'La boleta volvió al inventario común.',
    searchLegend: 'Buscar una boleta',
    searchHint:
      'Escribe uno de los dos números, o los dos. Un número puede repetirse en varias boletas: fíjate en los dos antes de apartar.',
    /** D-261: con un solo número, cada boleta es su número: no hay otro que mirar. */
    searchHintSingle: 'Escribe el número completo o una parte.',
    showLabel: 'Mostrar',
    showFree: 'Solo las libres',
    showAll: 'Todas',
    search: 'Buscar',
    clear: 'Limpiar',
    take: 'Apartar',
    takeAria: (numbers: string) => `Apartar la boleta ${numbers}`,
    takeTitle: (numbers: string) => `Apartar la boleta ${numbers}`,
    takeDescription: (minutes: number) =>
      `La tendrás ${minutes} minutos para venderla. Si no la vendes ni la devuelves, vuelve sola al inventario común.`,
    takeConfirm: 'Apartar boleta',
    taking: 'Apartando…',
    takeFailed: 'No pudimos apartar la boleta. Vuelve a intentarlo.',
    takeNoAnswer: 'No pudimos confirmar el apartado. Revisa tu conexión y vuelve a intentarlo.',
    extendFailed: `No pudimos sumar los ${HOLD_EXTENSION_MINUTES} minutos. Vuelve a intentarlo.`,
    taken: (numbers: string, iso: string) =>
      `Apartaste la boleta ${numbers} hasta las ${formatTimeEs(iso)}`,
    alreadyYours: (numbers: string, iso: string) =>
      `Ya tenías apartada la boleta ${numbers}. Sigue venciendo a las ${formatTimeEs(iso)}`,
    resultsEmptyFree: 'No quedan boletas libres en el inventario común',
    resultsEmptyFreeDescription: 'Cuando el dueño genere o recupere boletas, aparecerán aquí.',
    resultsEmptySearch: 'Ninguna boleta coincide con esa búsqueda',
    resultsEmptySearchDescription: 'Revisa los números o busca solo por uno de los dos.',
    noRaffle: 'No hay una rifa activa',
    noRaffleDescription:
      'El inventario común se abre cuando la rifa está activa. Pregúntale al dueño cuándo empieza.',
    myTicketsNotice: (free: number) =>
      free === 1
        ? 'Hay 1 boleta libre en el inventario común.'
        : `Hay ${formatCount(free)} boletas libres en el inventario común.`,
    myTicketsNoticeAction: 'Buscar y apartar',
  },
} as const

/** La insignia de cada boleta del catalogo interno. */
export const AVAILABILITY_LABELS: Record<InventoryAvailability, string> = {
  free: 'Libre',
  held_by_me: 'Apartada por ti',
  mine: 'En tus boletas',
  unavailable: 'No disponible',
}
