import { formatCOP } from '@/lib/money'

/**
 * Los textos de la configuracion de ganancias (D-237), TODOS JUNTOS (Anexo B de
 * `docs/UX_COPY_GUIDELINES.md`): la lista general, el alta con su acuerdo, la
 * ficha, el cambio de acuerdo y lo que lee el vendedor en su panel.
 *
 * Los mensajes de validacion de una lista viven en `tiers.ts`, porque son los
 * mismos que responde la base, letra por letra.
 */

/** «1 boleta cobrada», «25 boletas cobradas»: nunca «1 boletas» (D-111). */
export function paidTicketsPhrase(count: number): string {
  return count === 1 ? '1 boleta cobrada' : `${count} boletas cobradas`
}

/** «2 rifas», «1 rifa». */
function rafflesPhrase(count: number): string {
  return count === 1 ? '1 rifa' : `${count} rifas`
}

/** «A, B y C». */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

export const EARNINGS_COPY = {
  /** La seccion de «Configuración» del personal y su tarjeta de resumen. */
  settings: {
    title: 'Configuración',
    description: 'Ajustes de tu organización.',
    earningsTitle: 'Ganancias de vendedores',
    earningsStatus: (tiers: number, version: number) =>
      `Lista general: ${tiers === 1 ? '1 tramo' : `${tiers} tramos`} · versión ${version}`,
    earningsStatusMissing: 'Todavía no hay lista general',
  },

  /** La pantalla de la lista general (BR-G29). */
  template: {
    title: 'Ganancias de vendedores',
    description: 'La lista general de tramos que se ofrece al dar de alta a un vendedor.',
    cardTitle: 'Lista general de tramos',
    version: (version: number, savedAt: string) => `Versión ${version} · guardada el ${savedAt}`,
    howItWorks:
      'Cada tramo dice cuánto gana un vendedor por boleta según cuántas lleve cobradas completas en la rifa. Al subir de tramo, el valor nuevo se aplica a todas las que ya cobró.',
    newVersion:
      'Guardar crea una versión nueva. Quien ya gana por tramos conserva los suyos: la lista nueva se usa en las altas y en los cambios de ganancia que se hagan desde ahora.',
    teamCount: 'Para un vendedor con equipo, el tramo cuenta sus boletas y las de su equipo.',
    changedNotice:
      'Al guardar, esta lista se usará en las próximas altas y en los cambios de ganancia. Nadie que ya gane por tramos cambia de lista.',
    save: 'Guardar lista general',
    saving: 'Guardando...',
    discard: 'Descartar cambios',
    saved: (version: number) => `La lista general quedó guardada como versión ${version}.`,
    unchanged: 'No cambiaste nada, así que no se guardó una versión nueva.',
    missing:
      'Tu organización todavía no tiene una lista general de tramos. Escribe la primera y guárdala.',
  },

  /** El editor de tramos, en la lista general y al personalizar. */
  editor: {
    from: 'Desde',
    to: 'Hasta',
    rate: 'Ganancia por boleta',
    fromHint: 'boletas cobradas',
    orMore: 'o más',
    rowLabel: (index: number) => `Tramo ${index}`,
    fromLabel: (index: number) => `Tramo ${index}: desde cuántas boletas cobradas`,
    rateLabel: (index: number) => `Tramo ${index}: ganancia por boleta`,
    toLabel: (index: number, to: number | null) =>
      to === null ? `Tramo ${index}: en adelante` : `Tramo ${index}: hasta ${to} boletas`,
    add: 'Agregar tramo',
    remove: (index: number) => `Quitar el tramo ${index}`,
    firstFixed: 'El primer tramo siempre empieza en 1 boleta.',
    full: 'Puedes tener como máximo 20 tramos.',
  },

  /** Como se lee un acuerdo, en la ficha y en el panel. */
  agreement: {
    half: 'La mitad del precio de cada boleta que cobre completa',
    halfKept: 'La conserva de antes. Si se cambia, no se puede volver a asignar.',
    fixed: (amount: number) => `${formatCOP(amount)} por cada boleta que cobre completa`,
    tiered: 'Ganancia por tramos',
    currentTemplate: 'Con la lista general vigente.',
    oldTemplate: 'Con una versión anterior de la lista general, que conserva.',
    custom: 'Con tramos personalizados, solo para esta persona.',
    // Con tramos, lo que vende su equipo lo sube de tramo (BR-G27); con la
    // mitad o un fijo no hay tramo que subir, y decirlo seria falso.
    teamHead: (tiered: boolean) =>
      tiered
        ? 'Tiene equipo: su tramo cuenta sus boletas y las de su equipo, y por cada boleta de un integrante gana su tarifa menos la del integrante.'
        : 'Tiene equipo: por cada boleta de un integrante gana su tarifa menos la del integrante.',
    // En el cambio, antes de elegir: vale para las dos tarjetas.
    teamHeadChoice:
      'Tiene equipo: por cada boleta de un integrante gana su tarifa menos la del integrante, y con tramos las boletas de su equipo también cuentan para su tramo.',
    teamMember: (parentName: string) => `Lo decide ${parentName}, su vendedor a cargo.`,
    unreadable: 'No pudimos leer sus tramos.',
  },

  /** «Cómo le vas a pagar», en el alta y en el cambio, para el personal. */
  field: {
    legend: 'Cómo le vas a pagar',
    tieredDescription:
      'Gana más por cada boleta a medida que cobra más. Al subir de tramo, el valor nuevo se aplica a todas las boletas que ya cobró en la rifa.',
    fixedDescription:
      'Tú defines un valor. Gana esa misma cantidad por cada boleta que cobre completa, venda las que venda.',
    staffTeamNote: 'Si arma un equipo, las boletas que cobre su equipo también cuentan para su tramo.',
    teamNote:
      'Su ganancia sale de la tuya: de cada boleta que cobre tu equipo, tú recibes lo que quede después de pagarle.',
    templateCaption: 'Lista general',
    customCaption: 'Tramos personalizados',
    keptCaption: 'Sus tramos de ahora',
    personalize: 'Personalizar tramos',
    useTemplate: 'Usar la lista general',
    personalizeHint: 'Solo valen para esta persona. La lista general no cambia.',
    fixedLabel: 'Ganancia por boleta',
    fixedExample: `Ejemplo: si escribes ${formatCOP(30_000)}, ganará ${formatCOP(30_000)} por cada boleta que cobre completa.`,
    /** El tope que le cabe a un integrante, dicho como lo dice la base (BR-G28). */
    teamCap: (amount: number, parentTiered: boolean) =>
      parentTiered
        ? `Puedes darle hasta ${formatCOP(amount)}, que es lo que ganas tú por boleta en tu primer tramo.`
        : `Puedes darle hasta ${formatCOP(amount)}, que es lo que ganas tú por boleta.`,
    noTemplate: 'Todavía no hay una lista general de tramos. Pídesela a quien administra la rifa.',
    noTemplateStaff:
      'Todavía no hay una lista general de tramos. Guárdala primero en «Configuración», en «Ganancias de vendedores».',
  },

  /** El cambio de acuerdo que hace el personal (BR-G31). */
  change: {
    button: 'Cambiar',
    title: (name: string) => `Cambiar la ganancia de ${name}`,
    description: 'Elige cómo le pagas por cada boleta que cobre completa.',
    halfNotice:
      'Hoy gana la mitad del precio de cada boleta. Si eliges otra forma de pago, ya no podrás volver a dársela.',
    recalculates: (name: string, raffles: readonly string[], team: boolean) =>
      `Al guardar, volvemos a calcular lo que ${name} lleva ganado en ${joinList(raffles)}${team ? ', y lo que gana por las ventas de su equipo' : ''}. Puede subir o bajar.`,
    nothingToRecalculate: (name: string) =>
      `${name} todavía no ha cobrado ninguna boleta completa, así que no hay nada que recalcular.`,
    raffleWithCount: (raffle: string, count: number) => `«${raffle}» (${paidTicketsPhrase(count)})`,
    saveAndRecalculate: 'Guardar y recalcular',
    save: 'Guardar cambios',
    saving: 'Guardando...',
    cancel: 'Cancelar',
    saved: (name: string, raffles: number) =>
      raffles > 0
        ? `La ganancia de ${name} quedó guardada. Recalculamos lo que lleva ganado en ${rafflesPhrase(raffles)}.`
        : `La ganancia de ${name} quedó guardada.`,
    unchanged: 'No cambiaste nada, así que no se recalculó nada.',
  },

  /** Lo que lee el vendedor en su panel y en «Mi equipo». */
  seller: {
    // «por tus boletas» solo cuando hay equipo: es lo que distingue las dos
    // lineas. Sin equipo sobra, y se queda la frase de siempre.
    ownEarned: (amount: number, withTeam: boolean) =>
      withTeam
        ? `Llevas ${formatCOP(amount)} ganados por tus boletas`
        : `Llevas ${formatCOP(amount)} ganados`,
    teamEarned: (amount: number) => `Y ${formatCOP(amount)} por las ventas de tu equipo`,
    totalEarned: (amount: number) => `En total, ${formatCOP(amount)}`,
    tierCount: (count: number) =>
      `Tu tramo cuenta tus boletas y las de tu equipo: ${paidTicketsPhrase(count)}.`,
    nextTier: (tickets: number, rate: number) =>
      tickets === 1
        ? `Te falta 1 boleta para ${formatCOP(rate)} por boleta`
        : `Te faltan ${tickets} boletas para ${formatCOP(rate)} por boleta`,
    nextTierWithTeam: (tickets: number, rate: number) =>
      tickets === 1
        ? `Te falta 1 boleta, tuya o de tu equipo, para ${formatCOP(rate)} por boleta`
        : `Te faltan ${tickets} boletas, tuyas o de tu equipo, para ${formatCOP(rate)} por boleta`,
    teamTierNote: 'Las boletas que cobra tu equipo también cuentan para tu tramo.',
  },
} as const
