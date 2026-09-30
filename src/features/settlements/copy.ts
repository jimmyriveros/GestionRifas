import { formatCOP } from '@/lib/money'

/**
 * Todos los textos del cierre de cuentas (D-241), juntos (UX_COPY_GUIDELINES,
 * Anexo B).
 *
 * LOS TERMINOS SON LOS DEL GLOSARIO (Anexo A). La propuesta de Figma decia
 * «responsable»; aqui es el **vendedor a cargo**, que es como la aplicacion ya
 * nombra al jefe de un equipo (D-238). Decia «Boletas asignadas»; aqui son
 * **Boletas activas** (D-172). Y «Registrar devolución» en manos del dueño se
 * convierte en «Confirmar devolución recibida» en manos de quien la recibe: el
 * dinero lo confirma siempre quien lo recibe (BR-Z05). Las tres adaptaciones
 * estan explicadas en D-241.
 *
 * EL DINERO SE ESCRIBE CON `formatCOP`, en pesos enteros, y NINGUNA cifra se
 * calcula aqui: llegan hechas de la base. Estas funciones solo arman frases.
 */

/** El primer nombre, para las frases que la propuesta escribe corto: «Falta recibir de Carlos». */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}

export const SETTLEMENT_COPY = {
  // ---------------------------------------------------------------------------
  // Navegacion y encabezados
  // ---------------------------------------------------------------------------
  nav: {
    staff: 'Cierre de cuentas',
    seller: 'Mi cierre de cuentas',
  },

  raffle: {
    label: 'Rifa',
    /** Nombre accesible del selector, que en el telefono va sin rotulo visible. */
    ariaLabel: 'Rifa de las cuentas',
    noRaffles: {
      title: 'Todavía no hay rifas',
      description: 'Cuando exista una rifa con boletas vendidas, aquí verás sus cuentas.',
    },
  },

  money: {
    /** Una resta en el calculo: «− $900.000». El signo lo dice la etiqueta, no el color. */
    minus: (amount: number) => `− ${formatCOP(amount)}`,
    plus: (amount: number) => `+ ${formatCOP(amount)}`,
    footer: 'Valores en pesos colombianos.',
  },

  // ---------------------------------------------------------------------------
  // Listado del personal
  // ---------------------------------------------------------------------------
  staffList: {
    title: 'Cierre de cuentas',
    description: 'Revisa cada cuenta y confirma el dinero que recibes.',
    scopeTitle: 'Cuentas con el dueño',
    scopeHint: 'Cada vendedor incluye las ventas de su equipo.',
    metrics: {
      received: 'Recibido',
      receivedHint: 'Dinero ya confirmado en esta rifa',
      pending: 'Falta recibir',
      pendingHint: (accounts: number) =>
        accounts === 0
          ? 'Nadie tiene dinero por entregar'
          : accounts === 1
            ? 'De 1 vendedor'
            : `De ${accounts} vendedores`,
      closed: 'Cuentas cerradas',
      closedValue: (closed: number, total: number) => `${closed} de ${total}`,
      closedHint: (missing: number) =>
        missing === 0
          ? 'No falta ninguna'
          : missing === 1
            ? 'Falta 1 por cerrar'
            : `Faltan ${missing} por cerrar`,
      inFavor: (amount: number, accounts: number) =>
        accounts === 1
          ? `Hay ${formatCOP(amount)} a favor de 1 vendedor: se le devuelven cuando lo confirme.`
          : `Hay ${formatCOP(amount)} a favor de ${accounts} vendedores: se les devuelven cuando lo confirmen.`,
    },
    tableTitle: 'Cuentas de los vendedores',
    searchLabel: 'Buscar vendedor',
    searchPlaceholder: 'Nombre del vendedor',
    statusLabel: 'Estado de la cuenta',
    statusOptions: {
      all: 'Todas las cuentas',
      open: 'Sin cerrar',
      closed: 'Cerradas',
      no_activity: 'Sin boletas pagadas',
    },
    clearFilters: 'Limpiar filtros',
    count: (n: number) => (n === 1 ? '1 vendedor' : `${n} vendedores`),
    columns: {
      seller: 'Vendedor',
      paid: 'Pagadas',
      pending: 'Falta recibir',
      status: 'Estado',
      action: 'Acción',
    },
    teamLine: (members: number) =>
      members === 0
        ? 'Solo sus ventas'
        : members === 1
          ? 'Sus ventas y las de 1 integrante'
          : `Sus ventas y las de ${members} integrantes`,
    paidOf: (sold: number) => `de ${sold} ${sold === 1 ? 'vendida' : 'vendidas'}`,
    paidCount: (paid: number, sold: number) =>
      `${paid} ${paid === 1 ? 'pagada' : 'pagadas'} de ${sold} ${sold === 1 ? 'vendida' : 'vendidas'}`,
    inFavorAmount: (amount: number) => `${formatCOP(amount)} a su favor`,
    owedLabel: 'Se le debe devolver',
    changedAfterClose: 'Cambió después del cierre',
    review: 'Revisar cuenta',
    viewClosed: 'Ver cierre',
    /** Nombre accesible del enlace de cada fila: el verbo solo no dice de quién es la cuenta. */
    reviewAria: (name: string) => `Revisar la cuenta de ${name}`,
    formerSeller: (name: string) => `${name} (ya no vende)`,
    inactiveSeller: (name: string) => `${name} (inactivo)`,
    internalNote: 'Lo que un integrante entrega a su vendedor a cargo no se suma a «Recibido».',
    empty: {
      title: 'Todavía no hay cuentas en esta rifa',
      description: 'Aparecen cuando un vendedor tiene boletas de esta rifa.',
    },
    emptyFiltered: {
      title: 'No hay cuentas con estos filtros',
      description: 'Cambia la búsqueda o el estado para ver otras cuentas.',
    },
  },

  // ---------------------------------------------------------------------------
  // La cuenta: piezas que comparten los dos portales
  // ---------------------------------------------------------------------------
  tickets: {
    active: 'Boletas activas',
    sold: 'Boletas vendidas',
    paid: 'Boletas pagadas',
    soldOf: (sold: number, active: number) => `${sold} de ${active}`,
    soldHint: (paid: number, unpaid: number) =>
      `${paid} ${paid === 1 ? 'pagada' : 'pagadas'} · ${unpaid} sin pagar`,
    includes: (paid: number, own: number, team: number) =>
      team > 0
        ? `Esta cuenta incluye las ${paid} pagadas: ${own} propias y ${team} del equipo.`
        : `Esta cuenta incluye ${paid === 1 ? 'la boleta pagada' : `las ${paid} pagadas`}.`,
    unpaidOut: (unpaid: number) =>
      unpaid === 0
        ? ''
        : unpaid === 1
          ? 'La boleta sin pagar aún no entra.'
          : `Las ${unpaid} sin pagar aún no entran.`,
    earningsFromPaid: 'Las ganancias se calculan con las pagadas.',
    /** Solo en la cuenta propia: lo abonado es cartera del vendedor (BR-Z03). */
    ownPartial: (amount: number) =>
      `Tus boletas sin pagar ya tienen ${formatCOP(amount)} en abonos. Entran en la cuenta cuando cada una quede pagada.`,
  },

  calc: {
    staffTitle: 'Así se calcula la entrega',
    collected: 'Valor de las boletas pagadas',
    collectedOf: (paid: number) =>
      `Valor de ${paid === 1 ? 'la boleta pagada' : `las ${paid} pagadas`}`,
    earningsOf: (name: string, team: boolean) =>
      team ? `Ganancia de ${name} y su equipo` : `Ganancia de ${name}`,
    earningsSplit: (name: string, holder: number, members: number) =>
      `${name}: ${formatCOP(holder)} · Integrantes: ${formatCOP(members)}`,
    ownerShare: 'Parte del dueño',
    prizesOf: (name: string, team: boolean) =>
      team ? `Premios pagados por ${name} y su equipo` : `Premios pagados por ${name}`,
    otherMovements: 'Movimientos por cambios de equipo',
    otherMovementsHint:
      'Lo que se entregó a un vendedor a cargo anterior se queda en su cuenta, y lo que se recibió de quien ya no está en el equipo se suma aquí.',
    totalDue: 'Total que debe entregar',
    delivered: 'Ya recibiste',
    refunded: 'Ya se devolvió',
  },

  sellerCalc: {
    ownTitle: 'Tu cuenta',
    memberTitle: 'Así queda tu cuenta',
    yourEarnings: 'Tu ganancia',
    yourEarningsSplit: (own: number, team: number) =>
      `${formatCOP(own)} por tus ventas y ${formatCOP(team)} por las de tu equipo.`,
    perTicket: (rate: number) => `${formatCOP(rate)} por cada boleta pagada.`,
    perTicketWithDiscounts: (rate: number) =>
      `${formatCOP(rate)} por cada boleta pagada, menos lo que rebajaste.`,
    teamEarnings: 'Ganancia de tu equipo',
    prizesYouAndTeam: 'Premios que pagaron tú y tu equipo',
    prizesYou: (n: number) => (n === 1 ? 'Premio que pagaste' : 'Premios que pagaste'),
    totalForOwner: 'Total para el dueño',
    totalFor: (name: string) => `Total para ${name}`,
    delivered: 'Ya entregaste',
    refunded: 'Te devolvieron',
    stillToDeliver: 'Falta entregar',
    inYourFavor: 'A tu favor',
  },

  // ---------------------------------------------------------------------------
  // El recuadro del saldo
  // ---------------------------------------------------------------------------
  hero: {
    // Personal, o vendedor a cargo mirando a su integrante
    pendingFrom: (name: string) => `Falta recibir de ${name}`,
    owedTo: (name: string) => `Debes devolver a ${name}`,
    received: 'Ya recibiste',
    refunded: 'Ya devolviste',
    register: 'Registrar recibido',
    registerAria: (name: string) => `Registrar lo que recibiste de ${name}`,
    onlyWhatYouHave: 'Confirma únicamente el dinero que ya tienes.',
    refundByReceiver: (name: string) =>
      `${name} confirma la devolución cuando reciba el dinero. La devolución no aumenta «Recibido».`,
    closeAccount: 'Cerrar cuenta',
    toCloseHint:
      'El saldo está en $0 y no falta información. Ciérrala para guardar sus cifras de hoy.',
    closedOn: (date: string) => `Cuenta cerrada el ${date}.`,
    closedNote: 'Cerrar una cuenta no cierra la rifa.',
    missingInfo: (unpaid: number) =>
      unpaid === 1
        ? 'Falta registrar quién pagó un premio para poder cerrarla.'
        : `Falta registrar quién pagó ${unpaid} premios para poder cerrarla.`,
    noActivity: 'Todavía no hay boletas pagadas en esta cuenta.',

    // El propio vendedor
    toOwner: 'Para entregar al dueño',
    toHead: (name: string) => `Para entregar a ${name}`,
    owedToYou: 'Te deben devolver',
    delivered: 'Ya entregaste',
    yourRefunds: 'Te devolvieron',
    includesTeam: 'Incluye tus ventas y las de tu equipo.',
    headIs: (name: string) => `${name} es tu vendedor a cargo.`,
    confirmRefund: 'Confirmar devolución recibida',
    confirmRefundHint: 'Confírmala cuando tengas el dinero en tus manos.',
    yourClosed: 'Tu cuenta está cerrada.',
    yourMissingInfo: 'Falta registrar quién pagó un premio de tu cuenta.',
    yourNoActivity: 'Todavía no tienes boletas pagadas en esta rifa.',
  },

  changed: {
    title: (date: string) => `Esta cuenta cambió después del cierre del ${date}.`,
    hint: 'El cierre conserva sus cifras. Revisa la diferencia antes de seguir.',
    atClose: 'Al cerrar',
    now: 'Ahora',
    inFavor: (amount: number) => `${formatCOP(amount)} a favor del vendedor`,
    fields: {
      tickets_paid: 'Boletas pagadas',
      collected: 'Valor de las boletas pagadas',
      earned: 'Ganancias',
      prizes_paid: 'Premios pagados por la cuenta',
      other_movements: 'Movimientos por cambios de equipo',
      total_due: 'Total para entregar',
      delivered: 'Entregado',
      refunded: 'Devuelto',
      balance: 'Saldo',
      awards: 'Premios ganados',
      awards_unpaid: 'Premios sin pago registrado',
      prize_cost: 'Valor de los premios pagados',
    } as Record<string, string>,
  },

  // ---------------------------------------------------------------------------
  // Premios
  // ---------------------------------------------------------------------------
  prizes: {
    staffTitle: 'Premios de esta cuenta',
    sellerTitle: 'Premios de tu cuenta',
    memberTitle: (name: string) => `Premios de ${name}`,
    summary: (count: number, amount: number) =>
      `${count} ${count === 1 ? 'premio' : 'premios'} · ${formatCOP(amount)}`,
    ticket: (daily: string | null, weekly: string | null) =>
      `Boleta ${daily ?? '—'} / ${weekly ?? '—'}`,
    draw: (date: string) => `Sorteo: ${date}`,
    paidBy: (name: string, date: string) => `${name} pagó el ${date}`,
    paidByOwner: (date: string) => `Dueño pagó el ${date}`,
    paidByYouOn: (date: string) => `Pagaste el ${date}`,
    seller: (name: string) => `Vendida por ${name}`,
    client: (name: string) => `Cliente: ${name}`,
    discounted: 'Se descuenta de la entrega',
    discountedFromYou: 'Se descuenta de lo que entregas',
    ownerPaid: 'Ya lo pagó el dueño',
    otherTeam: 'Lo pagó alguien de otro equipo',
    unpaid: 'Falta registrar quién lo pagó',
    valuePending: 'Valor por confirmar',
    conflict: 'Resultado por verificar',
    conflictHint: 'La fuente oficial publicó otro número. Registra el pago cuando se confirme.',
    numbersChanged: 'El número de esta boleta ya no es el que jugó. Requiere verificación.',
    missingAward: 'Este premio ya no aparece en el historial. Revisa este pago.',
    register: 'Registrar premio pagado',
    registerAria: (title: string) => `Registrar quién pagó ${title}`,
    void: 'Anular pago',
    ownerPaidNotice: (amount: number) =>
      `Los ${formatCOP(amount)} que pagó el dueño reducen su ganancia, pero no se descuentan otra vez de la entrega.`,
    ownerGain: 'Ganancia del dueño después de los premios',
    ownerGainPending: (unpaid: number) =>
      unpaid === 1
        ? 'Falta registrar un premio: esta cifra puede bajar.'
        : `Faltan ${unpaid} premios por registrar: esta cifra puede bajar.`,
    /** Lo que ve quien no puede registrarlo, para saber a quién pedírselo. */
    recordedByHead: (head: string) => `Lo registra ${head} cuando le confirmes que lo pagaste.`,
    recordedByStaff: 'Lo registra el dueño o un administrador cuando le confirmes quién lo pagó.',
    memberPaidByHead: (member: string, head: string) =>
      `Si lo pagó ${member}, lo registra ${head}, su vendedor a cargo.`,
    paidByYouTotal: 'Pagados por ti y tu equipo',
    paidByYou: 'Pagados por ti',
    paidByOwnerTotal: 'Pagados por el dueño',
    noDiscount: 'No se descuentan de tu entrega.',
    empty: 'Esta cuenta no tiene premios ganados.',
  },

  // ---------------------------------------------------------------------------
  // Entregas
  // ---------------------------------------------------------------------------
  transfers: {
    staffTitle: 'Entregas confirmadas',
    sellerTitle: 'Tus entregas',
    memberTitle: 'Entregas que confirmaste',
    receivedBy: (date: string, name: string) => `${date} · Recibido por ${name}`,
    refundConfirmedBy: (date: string, name: string) => `${date} · Devolución que confirmó ${name}`,
    refundYouConfirmed: (date: string) => `${date} · Devolución que confirmaste`,
    deliveredFrom: (date: string, name: string) => `${date} · Entregó ${name}`,
    confirmedByHead: (name: string) => `${name} confirmó que recibió este dinero.`,
    voided: (reason: string) => `Anulada: ${reason}`,
    void: 'Anular',
    voidAria: (date: string) => `Anular la entrega del ${date}`,
    empty: 'Todavía no hay entregas confirmadas.',
  },

  // ---------------------------------------------------------------------------
  // El equipo, en la cuenta del vendedor a cargo
  // ---------------------------------------------------------------------------
  team: {
    title: 'Cuentas con tu equipo',
    closedCount: (closed: number, total: number) =>
      `${closed} de ${total} ${total === 1 ? 'cuenta cerrada' : 'cuentas cerradas'}`,
    line: (paid: number, status: string) =>
      `${paid} ${paid === 1 ? 'pagada' : 'pagadas'} · ${status}`,
    pendingIncluded: (amount: number, name: string | null) =>
      name
        ? `Los ${formatCOP(amount)} pendientes de ${name} ya están incluidos en tu entrega al dueño.`
        : `Los ${formatCOP(amount)} que tu equipo todavía no te entrega ya están incluidos en tu entrega al dueño.`,
    view: (name: string) => `Ver la cuenta de ${name}`,
    empty: 'Tu equipo no tiene boletas en esta rifa.',
  },

  member: {
    title: (name: string) => `Cuenta de ${name}`,
    description: (raffle: string) => `${raffle} · Lo que te entrega`,
    calcTitle: 'Así se calcula lo que te entrega',
    earningsOf: (name: string) => `Ganancia de ${name}`,
    prizesOf: (name: string) => `Premios que pagó ${name}`,
    totalForYou: 'Total que te debe entregar',
    back: 'Volver a mi cierre de cuentas',
    notFound: {
      title: 'No encontramos esa cuenta',
      description: 'Solo ves las cuentas de los integrantes de tu equipo.',
    },
  },

  staffDetail: {
    back: 'Volver a cuentas',
    title: (name: string) => `Cuenta de ${name}`,
    description: (raffle: string, team: boolean) =>
      `${raffle} · ${team ? 'Sus ventas y las de su equipo' : 'Sus ventas'}`,
    privacy: 'Los nombres de los clientes solo aparecen en la cuenta de su vendedor.',
    notFound: {
      title: 'No encontramos esa cuenta',
      description:
        'Puede que ese vendedor no tenga boletas en esta rifa, o que su cuenta sea con su vendedor a cargo.',
    },
  },

  sellerPage: {
    title: 'Mi cierre de cuentas',
    description: (raffle: string) => raffle,
    empty: {
      title: 'Todavía no tienes boletas en esta rifa',
      description:
        'Cuando vendas y cobres boletas de esta rifa, aquí verás cuánto debes entregar y lo que ya entregaste.',
    },
  },

  error: {
    title: 'No pudimos cargar las cuentas',
    description: 'Suele ser algo pasajero. Vuelve a intentarlo en unos segundos.',
  },

  // ---------------------------------------------------------------------------
  // Dialogos
  // ---------------------------------------------------------------------------
  receiptDialog: {
    title: 'Confirmar dinero recibido',
    description: (name: string) => `Confirma que ya recibiste este dinero de ${name}.`,
    amount: 'Dinero recibido',
    amountHelper: 'Puedes registrar una entrega parcial.',
    date: 'Fecha de recibido',
    remaining: 'Saldo que quedará',
    willClose: 'Se guardará esta entrega y la cuenta quedará cerrada con los valores de hoy.',
    willStayOpen: 'Se guardará esta entrega y la cuenta seguirá con saldo pendiente.',
    willStayMissing:
      'Se guardará esta entrega. La cuenta se cierra cuando se registren los premios que faltan.',
    revalidate:
      'El saldo se vuelve a comprobar al confirmar. Si cambió, primero verás la diferencia.',
    cancel: 'Cancelar',
    confirm: 'Confirmar recibido',
    saving: 'Guardando...',
    success: (amount: number, closed: boolean) =>
      closed
        ? `Recibiste ${formatCOP(amount)}. La cuenta quedó cerrada.`
        : `Recibiste ${formatCOP(amount)}. La entrega quedó registrada.`,
    alreadySaved: 'Esa entrega ya estaba registrada. No se guardó dos veces.',
    tooMuch: (max: number) =>
      `No puedes confirmar más de ${formatCOP(max)}: es lo que falta por recibir.`,
    emptyAmount: 'Escribe cuánto dinero recibiste.',
  },

  refundDialog: {
    title: 'Confirmar devolución recibida',
    description: (from: string) => `Confirma que ya recibiste esta devolución de ${from}.`,
    descriptionFromOwner: 'Confirma que ya recibiste esta devolución del dueño.',
    amount: 'Dinero recibido',
    amountHelper: 'Puedes registrar una devolución parcial.',
    date: 'Fecha de recibido',
    remaining: 'Saldo a tu favor que quedará',
    willClose: 'Se guardará la devolución y tu cuenta quedará cerrada con los valores de hoy.',
    willStayOpen: 'Se guardará la devolución y seguirá quedando saldo a tu favor.',
    confirm: 'Confirmar devolución',
    success: (amount: number, closed: boolean) =>
      closed
        ? `Recibiste ${formatCOP(amount)} de devolución. Tu cuenta quedó cerrada.`
        : `Recibiste ${formatCOP(amount)} de devolución.`,
    tooMuch: (max: number) =>
      `No puedes confirmar más de ${formatCOP(max)}: es lo que falta devolver.`,
  },

  changedDialog: {
    badge: 'Revisar',
    title: 'La cuenta cambió',
    description:
      'Se registró otro movimiento mientras revisabas. Comprueba el nuevo saldo antes de confirmar.',
    before: 'Antes',
    now: 'Ahora',
    review: 'Revisar cuenta',
    notSaved: 'No se ha guardado nada.',
  },

  prizeDialog: {
    title: 'Registrar premio pagado',
    whoPaid: '¿Quién lo pagó?',
    whoPaidPlaceholder: 'Elige quién lo pagó',
    ownerOption: 'El dueño',
    youOption: (name: string) => `Yo, ${name}`,
    value: 'Valor del premio',
    valueKnownHint: 'Es el valor del premio: no se puede cambiar.',
    valuePaid: 'Valor pagado',
    valuePendingHint: 'Es un premio en especie o con alternativas: escribe el valor que se pagó.',
    date: 'Fecha de pago',
    effect: {
      ticketSellerMember: (member: string) =>
        `Este valor se descontará de lo que ${member} te entrega. Su ganancia no cambia.`,
      ticketSeller: (seller: string) =>
        `Este valor se descontará de lo que ${seller} entrega. Su ganancia no cambia.`,
      head: (head: string, member: string) =>
        `Este valor se descontará de lo que ${head} entrega. La cuenta de ${member} con ${head} no cambia.`,
      owner: 'Lo pagó el dueño: baja la ganancia del dueño y no cambia lo que se entrega.',
    },
    cancel: 'Cancelar',
    confirm: 'Confirmar premio pagado',
    saving: 'Guardando...',
    success: 'El pago del premio quedó registrado.',
    successClosed: 'El pago del premio quedó registrado y la cuenta quedó cerrada.',
    alreadySaved: 'Ese pago ya estaba registrado. No se guardó dos veces.',
    emptyValue: 'Escribe el valor del premio que se pagó.',
    choosePayer: 'Elige quién pagó el premio.',
  },

  voidDialog: {
    transferTitle: 'Anular entrega',
    transferDescription: (amount: number) =>
      `La entrega de ${formatCOP(amount)} deja de contar y el saldo vuelve a subir. Queda en el historial como anulada.`,
    prizeTitle: 'Anular pago del premio',
    prizeDescription: (amount: number) =>
      `El pago de ${formatCOP(amount)} deja de contar y el premio vuelve a quedar sin pago registrado. Queda en el historial.`,
    reason: 'Motivo de la anulación',
    reasonHint: 'Queda guardado en el historial de la cuenta.',
    cancel: 'Cancelar',
    confirmTransfer: 'Anular entrega',
    confirmPrize: 'Anular pago',
    saving: 'Anulando...',
    successTransfer: 'La entrega quedó anulada.',
    successPrize: 'El pago del premio quedó anulado.',
    reasonLength: 'Escribe el motivo de la anulación, de 5 a 500 caracteres.',
  },

  closeDialog: {
    title: 'Cerrar cuenta',
    description: (name: string) =>
      `La cuenta de ${name} está en $0 y no falta información. Se guardará el cierre con las cifras de hoy. Cerrar una cuenta no cierra la rifa.`,
    confirm: 'Cerrar cuenta',
    saving: 'Cerrando...',
    success: 'La cuenta quedó cerrada.',
    changed: 'La cuenta cambió mientras la revisabas. Revisa sus cifras de nuevo.',
  },
} as const
