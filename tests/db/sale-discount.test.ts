/**
 * Precio de venta rebajado (migracion 0028, BR-P09..BR-P12, BR-G17..BR-G19,
 * D-099).
 *
 * LA REGLA QUE SE PRUEBA AQUI, EN UNA LINEA: el vendedor puede vender mas
 * barato, y la rebaja sale INTEGRA de su comision; lo que le queda a la empresa
 * no se mueve ni un peso.
 *
 * La comprobacion que de verdad importa no es ninguna cifra concreta, sino la
 * identidad algebraica que se comprueba en cada escenario:
 *
 *     cobrado_al_cliente − comision_del_vendedor = n × (precio_oficial − tarifa)
 *
 * El lado derecho no contiene el descuento. Da igual cuanto rebaje el vendedor:
 * lo que sobra tras pagarle depende solo del precio oficial y de la tarifa
 * pactada. Es la traduccion exacta de «el Admin NUNCA pierde dinero por el
 * descuento que haga el vendedor».
 *
 * MATIZ ANADIDO EN 0031 (BR-G20): ese lado derecho ya no es «lo de la empresa»
 * cuando quien vende es un integrante de equipo, porque de ahi sale ademas la
 * parte de su vendedor padre. La identidad de arriba sigue siendo cierta y
 * sigue siendo lo que estas pruebas comprueban —la rebaja no la toca—; lo que
 * la empresa se queda de verdad, la mitad del precio pase lo que pase, se
 * comprueba en `tests/db/team-commission.test.ts` (E10-06).
 *
 * NINGUNA CIFRA DE PRECIO SE ESCRIBE A MANO (D-098). El precio sale de la rifa
 * y la tarifa de `seller_commissions`: una prueba que fije «$120.000» vuelve a
 * caerse el dia que el precio cambie, apuntando al sitio equivocado.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL, loadSeedContext, SEED_PASSWORD, signInAs, type Client } from './helpers'

let db: PgClient
let ctx: Awaited<ReturnType<typeof loadSeedContext>>

/** Precio oficial de la rifa de esta suite. Se lee, no se escribe. */
let PRECIO: number

let rifaId: string
/** Vendedor SIN vendedor padre: cobra la mitad del precio vigente (BR-G13). */
let sueltoId: string
let suelto: Client
/** Vendedor DENTRO de un equipo: cobra por tramos (BR-G13). */
let equipoId: string
let equipo: Client

const clientes = new Map<string, string>()
const numerosUsados = new Set<string>()

/**
 * Un numero de boleta que este LIBRE, buscado y no sorteado (I-057).
 *
 * Sortear a ciegas sobre un espacio compartido con el seed y con las demas
 * suites revienta el `beforeAll` de vez en cuando y arrastra el archivo entero.
 */
async function numeroLibre(): Promise<string> {
  for (let n = 1000; n < 10000; n++) {
    const numero = String(n)
    if (numerosUsados.has(numero)) continue

    const { rows } = await db.query(
      `select 1 from tickets
        where raffle_id = $1 and daily_number = $2 and weekly_number = $2 limit 1`,
      [rifaId, numero],
    )
    if (rows.length === 0) {
      numerosUsados.add(numero)
      return numero
    }
  }
  throw new Error('No queda ninguna combinacion libre en la rifa de la suite.')
}

/**
 * Crea —o recupera— un vendedor propio de esta suite.
 *
 * Nunca se usan `vendedor1`/`vendedor2` (I-035): son cuentas compartidas y
 * montarles equipo cambiaria el resultado de otras suites segun el orden.
 *
 * ES IDEMPOTENTE, y no por elegancia: la cuenta de Auth NO se puede borrar al
 * terminar. Estos vendedores venden con su propia sesion, asi que quedan como
 * ACTORES en `audit_logs`, que es de solo anexado y tiene FK contra el perfil
 * (BR-D02). Borrarlos exigiria reescribir la auditoria, que es exactamente lo
 * que ese diseño existe para impedir. Lo que si se borra es la MEMBRESIA: sin
 * ella la persona desaparece de la organizacion y de todas las pantallas, que
 * es lo unico que podria afectar a otra prueba.
 */
async function altaVendedor(nombre: string, padre: string | null): Promise<string> {
  const email = `${nombre}-descuento@demo.test`

  const { data: existente } = await ctx.svc
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  let profileId = existente?.id ?? null

  if (profileId === null) {
    const { data, error } = await ctx.svc.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `${nombre} Descuento`, phone: '3001234567' },
    })
    if (error) throw new Error(`No se pudo crear ${nombre}: ${error.message}`)
    profileId = data.user.id
  }

  // I-007: `createUser` no deja la contrasena utilizable por si sola.
  await ctx.svc.auth.admin.updateUserById(profileId, { password: SEED_PASSWORD })

  const { error: membresiaError } = await ctx.svc.from('memberships').insert({
    organization_id: ctx.demoOrg.id,
    profile_id: profileId,
    role: 'seller',
    parent_seller_id: padre,
  })
  if (membresiaError) throw membresiaError

  const { data: cliente, error: clienteError } = await ctx.svc
    .from('clients')
    .insert({
      organization_id: ctx.demoOrg.id,
      seller_id: profileId,
      name: `Cliente de ${nombre}`,
      phone: '3009998877',
    })
    .select('id')
    .single()
  if (clienteError) throw clienteError

  clientes.set(profileId, cliente.id)
  return profileId
}

/** Una boleta disponible de `sellerId`, lista para venderse. */
async function boletaDisponible(sellerId: string): Promise<string> {
  const numero = await numeroLibre()
  const { data, error } = await ctx.svc
    .from('tickets')
    .insert({
      organization_id: ctx.demoOrg.id,
      raffle_id: rifaId,
      seller_id: sellerId,
      created_by: ctx.ids.owner,
      daily_number: numero,
      weekly_number: numero,
      inventory_status: 'available',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Vende una boleta al precio indicado y la cobra ENTERA. Devuelve su id. */
async function venderYCobrar(
  sesion: Client,
  sellerId: string,
  precio: number | undefined,
): Promise<string> {
  const ticketId = await boletaDisponible(sellerId)
  const clienteId = clientes.get(sellerId)!

  const { error } = await sesion.rpc('bulk_assign_tickets', {
    p_ticket_ids: [ticketId],
    p_client_id: clienteId,
    p_sale_price: precio,
  })
  if (error) throw new Error(`No se pudo vender: ${error.message}`)

  const { data: fila } = await ctx.svc
    .from('tickets')
    .select('sale_price')
    .eq('id', ticketId)
    .single()

  const { error: pagoError } = await sesion.rpc('create_payment', {
    p_client_id: clienteId,
    p_total_amount: fila!.sale_price!,
    p_allocations: [{ ticket_id: ticketId, amount: fila!.sale_price! }],
  })
  if (pagoError) throw new Error(`No se pudo cobrar: ${pagoError.message}`)

  return ticketId
}

/** Comision viva de un vendedor en la rifa de la suite. */
async function comision(
  sellerId: string,
): Promise<{ n: number; rate: number; earned: number; teamEarned: number }> {
  const { rows } = await db.query(
    `select tickets_paid, rate, earned, team_earned from seller_commissions
      where raffle_id = $1 and seller_id = $2`,
    [rifaId, sellerId],
  )
  const fila = rows[0] ?? { tickets_paid: 0, rate: 0, earned: 0, team_earned: 0 }
  return {
    n: fila.tickets_paid,
    rate: Number(fila.rate),
    earned: Number(fila.earned),
    teamEarned: Number(fila.team_earned),
  }
}

/** Suma de las rebajas concedidas en las boletas ya COBRADAS de un vendedor. */
async function rebajasCobradas(sellerId: string): Promise<number> {
  const { rows } = await db.query(
    `select coalesce(sum(coalesce(t.base_price, t.sale_price) - t.sale_price), 0)::bigint as total
       from tickets t
      where t.raffle_id = $1 and t.seller_id = $2
        and t.inventory_status = 'assigned' and t.payment_status = 'paid'`,
    [rifaId, sellerId],
  )
  return Number(rows[0].total)
}

/**
 * Lo que queda de las boletas de este vendedor DESPUES DE PAGARLE A EL: cobrado
 * a los clientes menos su comision.
 *
 * Se llamaba «participacionEmpresa» y desde 0031 ese nombre mentiria para un
 * integrante de equipo: de lo que sobra tras pagarle, una parte se la lleva su
 * vendedor padre (BR-G20) y solo el resto es de la empresa. Lo que estas pruebas
 * comprueban con esta cifra sigue siendo cierto y sigue siendo el punto: la
 * rebaja NO la toca, se la queda entera quien la concedio (BR-G17). Que la
 * empresa se quede exactamente la mitad del precio lo comprueba E10-06.
 */
async function restoTrasPagarAlVendedor(sellerId: string): Promise<number> {
  const { rows } = await db.query(
    `select coalesce(sum(t.sale_price), 0)::bigint as cobrado
       from tickets t
      where t.raffle_id = $1 and t.seller_id = $2
        and t.inventory_status = 'assigned' and t.payment_status = 'paid'`,
    [rifaId, sellerId],
  )
  const { earned } = await comision(sellerId)
  return Number(rows[0].cobrado) - earned
}

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  ctx = await loadSeedContext()

  const { data: rifa, error } = await ctx.svc
    .from('raffles')
    .insert({
      organization_id: ctx.demoOrg.id,
      name: 'Rifa Rebaja 0028',
      status: 'active',
      start_date: '2026-08-01',
      end_date: '2026-12-31',
      created_by: ctx.ids.owner,
    })
    .select('id, ticket_price')
    .single()
  if (error) throw error

  rifaId = rifa.id
  PRECIO = rifa.ticket_price

  sueltoId = await altaVendedor('suelto', null)
  equipoId = await altaVendedor('integrante', sueltoId)

  suelto = await signInAs('suelto-descuento@demo.test')
  equipo = await signInAs('integrante-descuento@demo.test')
}, 90_000)

/**
 * Limpieza en UNA transaccion por `pg` (I-059): PostgREST manda cada `delete`
 * en su propia transaccion y el trigger diferido `payments_balanced` hace que
 * borrar las asignaciones a solas falle DEVOLVIENDO el error en vez de
 * lanzarlo, con lo que la base se queda llena sin que nadie se entere.
 *
 * Las comisiones se borran DESPUES de las boletas: `tickets_sync_commission` se
 * dispara `after delete` y volveria a escribirlas.
 */
afterAll(async () => {
  const vendedores = [sueltoId, equipoId].filter(Boolean)

  // Se borra por VENDEDOR, no por la lista de clientes que creo el `beforeAll`:
  // la prueba del importador crea un cliente mas, y una lista fijada de
  // antemano lo dejaria atras — con el que la membresia ya no se puede borrar.
  try {
    await db.query('begin')
    await db.query(
      `delete from payment_allocations
        where payment_id in (select id from payments where seller_id = any($1::uuid[]))`,
      [vendedores],
    )
    await db.query(`delete from payments where seller_id = any($1::uuid[])`, [vendedores])
    await db.query(
      `delete from notifications where entity_id in (select id from tickets where raffle_id = $1)`,
      [rifaId],
    )
    await db.query(`delete from tickets where raffle_id = $1`, [rifaId])
    await db.query(`delete from commission_ledger where raffle_id = $1`, [rifaId])
    await db.query(`delete from seller_commissions where raffle_id = $1`, [rifaId])
    await db.query(`delete from clients where seller_id = any($1::uuid[])`, [vendedores])
    await db.query(`delete from raffles where id = $1`, [rifaId])
    await db.query(`delete from notifications where recipient_profile_id = any($1::uuid[])`, [
      vendedores,
    ])
    // El integrante primero: la FK del vendedor padre es `on delete restrict`.
    await db.query(`delete from memberships where parent_seller_id = any($1::uuid[])`, [vendedores])
    await db.query(`delete from memberships where profile_id = any($1::uuid[])`, [vendedores])
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }

  // Las cuentas de Auth NO se borran: son actores de `audit_logs` (ver
  // `altaVendedor`). Sin membresia ya no pertenecen a ninguna organizacion.
  const { rows } = await db.query(`select count(*)::int as n from raffles where id = $1`, [rifaId])
  expect(rows[0].n, 'la suite debe dejar la base como la encontro').toBe(0)

  await db.end()
}, 90_000)

describe('E8 — el precio de venta se puede rebajar', () => {
  it('E8-01: sin precio explicito se vende al oficial y la rebaja es cero', async () => {
    const ticketId = await boletaDisponible(sueltoId)

    const { error } = await suelto.rpc('bulk_assign_tickets', {
      p_ticket_ids: [ticketId],
      p_client_id: clientes.get(sueltoId)!,
    })
    expect(error).toBeNull()

    const { rows } = await db.query(`select sale_price, base_price from tickets where id = $1`, [
      ticketId,
    ])
    expect(Number(rows[0].sale_price)).toBe(PRECIO)
    expect(Number(rows[0].base_price)).toBe(PRECIO)
  })

  it('E8-02: el precio oficial queda CONGELADO al vender (BR-P10)', async () => {
    const ticketId = await boletaDisponible(sueltoId)
    const rebajado = PRECIO - 20_000

    await suelto.rpc('bulk_assign_tickets', {
      p_ticket_ids: [ticketId],
      p_client_id: clientes.get(sueltoId)!,
      p_sale_price: rebajado,
    })

    const { rows } = await db.query(`select sale_price, base_price from tickets where id = $1`, [
      ticketId,
    ])
    expect(Number(rows[0].sale_price)).toBe(rebajado)
    expect(Number(rows[0].base_price)).toBe(PRECIO)
  })

  it('E8-03: no se puede vender por ENCIMA del precio oficial', async () => {
    const ticketId = await boletaDisponible(sueltoId)

    const { error } = await suelto.rpc('bulk_assign_tickets', {
      p_ticket_ids: [ticketId],
      p_client_id: clientes.get(sueltoId)!,
      p_sale_price: PRECIO + 1,
    })

    expect(error?.message).toMatch(/no puede ser mayor que el precio de la rifa/i)
  })

  it('E8-04 (CASO G): no se puede rebajar mas alla del limite', async () => {
    const ticketId = await boletaDisponible(sueltoId)

    // Quien no pertenece a un equipo cobra la mitad: su suelo es la otra mitad.
    const { rows } = await db.query(`select min_sale_price from ticket_sale_price_limits($1)`, [
      ticketId,
    ])
    const minimo = Number(rows[0].min_sale_price)
    expect(minimo).toBe(PRECIO - Math.floor(PRECIO / 2))

    const { error } = await suelto.rpc('bulk_assign_tickets', {
      p_ticket_ids: [ticketId],
      p_client_id: clientes.get(sueltoId)!,
      p_sale_price: minimo - 1,
    })

    expect(error?.message).toMatch(/mayor de lo que puedes asumir/i)
  })

  it('E8-05: el limite de un integrante es su tramo MAS BAJO, no el vigente', async () => {
    const ticketId = await boletaDisponible(equipoId)

    const { rows: tramo } = await db.query(
      `select min(rate)::bigint as suelo from commission_tiers where organization_id = $1`,
      [ctx.demoOrg.id],
    )
    const { rows } = await db.query(`select min_sale_price from ticket_sale_price_limits($1)`, [
      ticketId,
    ])

    // Es el suelo y no la tarifa de hoy a proposito (BR-G18): la tarifa por
    // tramos baja sola al anularse un pago, y una rebaja calculada sobre la
    // tarifa alta dejaria esa venta en comision negativa.
    expect(Number(rows[0].min_sale_price)).toBe(PRECIO - Number(tramo[0].suelo))
  })
})

describe('E8 — la empresa nunca pierde por la rebaja', () => {
  it('E8-06 (CASO A): sin rebaja, mitad y mitad', async () => {
    await venderYCobrar(suelto, sueltoId, undefined)

    const { n, rate, earned } = await comision(sueltoId)
    expect(rate).toBe(Math.floor(PRECIO / 2))
    expect(earned).toBe(n * rate)
    expect(await restoTrasPagarAlVendedor(sueltoId)).toBe(n * (PRECIO - rate))
  })

  it('E8-07 (CASO B): rebaja de $20.000 — la asume entera el vendedor', async () => {
    const antes = await comision(sueltoId)
    const restoAntes = await restoTrasPagarAlVendedor(sueltoId)

    await venderYCobrar(suelto, sueltoId, PRECIO - 20_000)

    const despues = await comision(sueltoId)

    // El vendedor gana la tarifa MENOS la rebaja...
    expect(despues.earned - antes.earned).toBe(despues.rate - 20_000)
    // ...y la empresa se lleva exactamente lo mismo que por una boleta sin rebaja.
    expect((await restoTrasPagarAlVendedor(sueltoId)) - restoAntes).toBe(PRECIO - despues.rate)
  })

  it('E8-08 (CASO C): rebaja maxima — el vendedor gana $0 y la empresa, igual', async () => {
    const antes = await comision(sueltoId)
    const restoAntes = await restoTrasPagarAlVendedor(sueltoId)
    const minimo = PRECIO - Math.floor(PRECIO / 2)

    await venderYCobrar(suelto, sueltoId, minimo)

    const despues = await comision(sueltoId)

    expect(despues.earned - antes.earned).toBe(0)
    expect((await restoTrasPagarAlVendedor(sueltoId)) - restoAntes).toBe(PRECIO - despues.rate)
  })

  it('E8-09 (CASO D): con OTRA tarifa —por tramos— la regla es la misma', async () => {
    await venderYCobrar(equipo, equipoId, undefined)
    const antes = await comision(equipoId)
    const restoAntes = await restoTrasPagarAlVendedor(equipoId)

    await venderYCobrar(equipo, equipoId, PRECIO - 10_000)

    const despues = await comision(equipoId)

    // La tarifa por tramos no es la mitad del precio, y aun asi el reparto
    // funciona igual: la rebaja sale del vendedor, no de la empresa.
    expect(despues.rate).not.toBe(Math.floor(PRECIO / 2))
    expect((await restoTrasPagarAlVendedor(equipoId)) - restoAntes).toBe(
      PRECIO - despues.rate + antes.n * (antes.rate - despues.rate),
    )
  })

  it('E8-10: la identidad se cumple para los dos vendedores a la vez', async () => {
    for (const sellerId of [sueltoId, equipoId]) {
      const { n, rate } = await comision(sellerId)
      // cobrado − comision = n × (precio oficial − tarifa). Sin rastro de la
      // rebaja: ahi esta la garantia que pedia el encargo.
      expect(await restoTrasPagarAlVendedor(sellerId)).toBe(n * (PRECIO - rate))
    }
  })

  it('E8-11: sum(commission_ledger) = earned, con rebajas de por medio (BR-G10)', async () => {
    // Desde 0031 la invariante tiene DOS mitades, porque `sueltoId` es el
    // vendedor padre de `equipoId` y cobra por sus ventas (BR-G20). El ledger
    // las separa con `team_movement`, y comprobarlas por separado es mas
    // fuerte que comprobar el total: un error que se compensara entre las dos
    // pasaria desapercibido sumandolas (BR-G22).
    for (const sellerId of [sueltoId, equipoId]) {
      const { rows } = await db.query(
        `select
           coalesce(sum(amount) filter (where not team_movement), 0)::bigint as propio,
           coalesce(sum(amount) filter (where team_movement), 0)::bigint     as equipo
         from commission_ledger
          where raffle_id = $1 and seller_id = $2`,
        [rifaId, sellerId],
      )
      const { earned, teamEarned } = await comision(sellerId)
      expect(Number(rows[0].propio), 'el ledger propio explica `earned`').toBe(earned)
      expect(Number(rows[0].equipo), 'el ledger de equipo explica `team_earned`').toBe(teamEarned)
    }
  })

  it('E8-12: la rebaja deja su propio movimiento en el historial', async () => {
    const { rows } = await db.query(
      `select count(*)::int as n from commission_ledger
        where raffle_id = $1 and movement = 'discount' and amount < 0`,
      [rifaId],
    )
    expect(rows[0].n).toBeGreaterThan(0)
  })

  it('E8-13: la comision nunca queda en negativo', async () => {
    const { rows } = await db.query(
      `select count(*)::int as n from seller_commissions where earned < 0`,
    )
    expect(rows[0].n).toBe(0)
  })
})

describe('E8 — lo que debe el cliente es el precio rebajado', () => {
  let ticketId: string
  let rebajado: number

  beforeAll(async () => {
    rebajado = PRECIO - 20_000
    ticketId = await boletaDisponible(sueltoId)
    await suelto.rpc('bulk_assign_tickets', {
      p_ticket_ids: [ticketId],
      p_client_id: clientes.get(sueltoId)!,
      p_sale_price: rebajado,
    })
  })

  it('E8-14 (CASO E): un abono parcial deja el saldo contra el precio REBAJADO', async () => {
    const abono = 40_000
    const { error } = await suelto.rpc('create_payment', {
      p_client_id: clientes.get(sueltoId)!,
      p_total_amount: abono,
      p_allocations: [{ ticket_id: ticketId, amount: abono }],
    })
    expect(error).toBeNull()

    const { rows } = await db.query(
      `select payment_status, pending_amount from v_ticket_balances where ticket_id = $1`,
      [ticketId],
    )
    expect(Number(rows[0].pending_amount)).toBe(rebajado - abono)
    expect(rows[0].payment_status).toBe('partial')
  })

  it('E8-15 (CASO E): al completar el precio REBAJADO la boleta queda Pagada', async () => {
    const resto = rebajado - 40_000
    const { error } = await suelto.rpc('create_payment', {
      p_client_id: clientes.get(sueltoId)!,
      p_total_amount: resto,
      p_allocations: [{ ticket_id: ticketId, amount: resto }],
    })
    expect(error).toBeNull()

    const { rows } = await db.query(
      `select payment_status, pending_amount, paid_amount, sale_price
         from v_ticket_balances where ticket_id = $1`,
      [ticketId],
    )
    // Pagada con MENOS dinero que el precio oficial: es justo lo que pedia el
    // encargo, y lo contrario de lo que vigila la trampa de D-098 —alli la
    // boleta valia el precio oficial y $100.000 NO la dejaban pagada—.
    expect(Number(rows[0].pending_amount)).toBe(0)
    expect(Number(rows[0].paid_amount)).toBe(rebajado)
    expect(Number(rows[0].paid_amount)).toBeLessThan(PRECIO)
    expect(rows[0].payment_status).toBe('paid')
  })

  it('E8-16: el sobrepago se bloquea contra el precio REBAJADO, no el oficial', async () => {
    const { error } = await suelto.rpc('create_payment', {
      p_client_id: clientes.get(sueltoId)!,
      p_total_amount: 1,
      p_allocations: [{ ticket_id: ticketId, amount: 1 }],
    })
    expect(error?.message).toMatch(/supera su saldo pendiente/i)
  })

  it('E8-17: con abonos, el precio sigue siendo inmutable (BR-P05)', async () => {
    const { rowCount } = await db
      .query(`update tickets set sale_price = sale_price - 1 where id = $1`, [ticketId])
      .catch((error: Error) => {
        expect(error.message).toMatch(/no se puede cambiar el precio/i)
        return { rowCount: -1 }
      })

    expect(rowCount, 'cambiar el precio con abonos debe fallar').toBe(-1)
  })
})

describe('E8 — compatibilidad con lo que ya existia', () => {
  it('E8-18 (CASO F): una boleta sin `base_price` cuenta como rebaja cero', async () => {
    // Asi son las 121 boletas que ya existen: vendidas antes de 0028.
    const numero = await numeroLibre()
    const { data: antigua, error } = await ctx.svc
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: rifaId,
        seller_id: equipoId,
        created_by: ctx.ids.owner,
        daily_number: numero,
        weekly_number: numero,
        inventory_status: 'assigned',
        client_id: clientes.get(equipoId)!,
        sale_price: PRECIO,
        base_price: null,
        sale_date: '2026-08-16',
        assigned_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(error).toBeNull()

    // Su rebaja es CERO: `coalesce(base_price, sale_price)` es lo que hace que
    // una boleta anterior a 0028 se comporte igual que antes.
    const { rows: propia } = await db.query(
      `select coalesce(base_price, sale_price) - sale_price as rebaja from tickets where id = $1`,
      [antigua!.id],
    )
    expect(Number(propia[0].rebaja)).toBe(0)

    const rebajasAntes = await rebajasCobradas(equipoId)

    // El pago lo registra el Dueño: `create_payment` acepta al personal para
    // cualquier cliente (BR-F02), y un vendedor solo para los suyos.
    const owner = await signInAs('owner@demo.test')
    const { error: pagoError } = await owner.rpc('create_payment', {
      p_client_id: clientes.get(equipoId)!,
      p_total_amount: PRECIO,
      p_allocations: [{ ticket_id: antigua!.id, amount: PRECIO }],
    })
    expect(pagoError).toBeNull()

    // No aporta ni un peso de rebaja, y la comision sigue cuadrando con la
    // formula general: n × tarifa − rebajas.
    expect(await rebajasCobradas(equipoId)).toBe(rebajasAntes)

    const despues = await comision(equipoId)
    expect(despues.earned).toBe(despues.n * despues.rate - rebajasAntes)
  })

  it('E8-19: la importacion masiva sigue vendiendo al precio oficial', async () => {
    // Seccion 16 del encargo: el contrato del CSV/JSON no cambia. La ausencia
    // de precio significa precio oficial, y eso lo garantiza el valor por
    // defecto del parametro, no una linea del importador.
    const numero = await numeroLibre()
    const owner = await signInAs('owner@demo.test')

    const { data, error } = await owner.rpc('import_tickets_with_clients', {
      p_raffle_id: rifaId,
      p_seller_id: sueltoId,
      p_rows: [
        {
          daily_number: numero,
          weekly_number: numero,
          client_name: 'Importado Sin Precio',
          client_phone: '3005554433',
        },
      ],
    })
    expect(error).toBeNull()
    expect(data).toBeTruthy()

    const { rows } = await db.query(
      `select sale_price, base_price from tickets
        where raffle_id = $1 and daily_number = $2`,
      [rifaId, numero],
    )
    expect(Number(rows[0].sale_price)).toBe(PRECIO)
    expect(Number(rows[0].base_price)).toBe(PRECIO)
  })
})
