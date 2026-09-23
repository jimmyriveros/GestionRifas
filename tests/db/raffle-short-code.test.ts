/**
 * Códigos de rifa a partir de 1.000 (I-157, D-220, migración 0077).
 *
 * La regla autorizada: se conservan los códigos existentes y se continúa
 * R999 → R1000 → R1001, con tres cifras como mínimo y sin recortar nunca.
 *
 * Casi todo corre dentro de una transacción que se DESHACE: la organización de
 * prueba, sus rifas y su contador no llegan a existir para nadie más. La
 * concurrencia no puede: dos conexiones solo compiten por el bloqueo si la
 * primera confirma, así que esa prueba crea su organización de verdad y la
 * borra al final, y un fallo de limpieza se LANZA.
 */
import { Client as PgClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DB_URL } from './helpers'

const ORG_A = '00000000-0000-4000-8000-0000000157a0'
const ORG_B = '00000000-0000-4000-8000-0000000157b0'
const ORG_CONC = '00000000-0000-4000-8000-0000000157c0'

let db: PgClient
let ownerId = ''

beforeAll(async () => {
  db = new PgClient({ connectionString: DB_URL })
  await db.connect()
  const { rows } = await db.query<{ id: string }>(
    `select id from profiles where email = 'owner@demo.test'`,
  )
  ownerId = rows[0]!.id
})

afterAll(async () => {
  await db.end()
})

/** Crea una rifa sin código: lo pone el disparador. Devuelve el código. */
async function nuevaRifa(client: PgClient, org: string, name: string): Promise<string> {
  const { rows } = await client.query<{ short_code: string }>(
    `insert into raffles (organization_id, name, ticket_price, status, start_date, end_date, created_by)
     values ($1, $2, 1000, 'draft', '2026-01-01', '2026-12-31', $3)
     returning short_code`,
    [org, name, ownerId],
  )
  return rows[0]!.short_code
}

/** Ejecuta `fn` dentro de una transacción que SIEMPRE se deshace. */
async function enTransaccion(fn: () => Promise<void>): Promise<void> {
  await db.query('begin')
  try {
    await fn()
  } finally {
    await db.query('rollback')
  }
}

async function nuevaOrganizacion(client: PgClient, id: string, counter: number) {
  await client.query(`insert into organizations (id, name, raffle_counter) values ($1, $2, $3)`, [
    id,
    `Prueba I-157 ${id.slice(-4)}`,
    counter,
  ])
}

describe('I-157 — el código de rifa no se recorta', () => {
  it('los límites 999 → 1000 → 1001', async () => {
    await enTransaccion(async () => {
      await nuevaOrganizacion(db, ORG_A, 998)
      expect(await nuevaRifa(db, ORG_A, 'la 999')).toBe('R999')
      expect(await nuevaRifa(db, ORG_A, 'la 1000')).toBe('R1000')
      expect(await nuevaRifa(db, ORG_A, 'la 1001')).toBe('R1001')
    })
  })

  it('los límites 9999 → 10000', async () => {
    await enTransaccion(async () => {
      await nuevaOrganizacion(db, ORG_A, 9998)
      expect(await nuevaRifa(db, ORG_A, 'la 9999')).toBe('R9999')
      expect(await nuevaRifa(db, ORG_A, 'la 10000')).toBe('R10000')
    })
  })

  it('por debajo de 1.000 el código es exactamente el de siempre', async () => {
    await enTransaccion(async () => {
      await nuevaOrganizacion(db, ORG_A, 0)
      expect(await nuevaRifa(db, ORG_A, 'la 1')).toBe('R001')
      await db.query('update organizations set raffle_counter = 98 where id = $1', [ORG_A])
      expect(await nuevaRifa(db, ORG_A, 'la 99')).toBe('R099')
      expect(await nuevaRifa(db, ORG_A, 'la 100')).toBe('R100')
    })
  })

  it('la rifa 1.000 ya no choca con la 100 —el defecto de antes—', async () => {
    await enTransaccion(async () => {
      await nuevaOrganizacion(db, ORG_A, 99)
      expect(await nuevaRifa(db, ORG_A, 'la 100')).toBe('R100')
      await db.query('update organizations set raffle_counter = 999 where id = $1', [ORG_A])
      // Con 0004 esto era `R100` y fallaba con raffles_org_short_code_key.
      expect(await nuevaRifa(db, ORG_A, 'la 1000')).toBe('R1000')
    })
  })

  it('cada organización lleva su propia cuenta: el mismo código en dos organizaciones', async () => {
    await enTransaccion(async () => {
      await nuevaOrganizacion(db, ORG_A, 999)
      await nuevaOrganizacion(db, ORG_B, 999)
      expect(await nuevaRifa(db, ORG_A, 'A 1000')).toBe('R1000')
      expect(await nuevaRifa(db, ORG_B, 'B 1000')).toBe('R1000')
      const { rows } = await db.query<{ raffle_counter: number }>(
        'select raffle_counter from organizations where id = any($1) order by id',
        [[ORG_A, ORG_B]],
      )
      expect(rows.map((row) => row.raffle_counter)).toEqual([1000, 1000])
    })
  })

  it('la unicidad por organización sigue en pie, también con cuatro cifras', async () => {
    await enTransaccion(async () => {
      await nuevaOrganizacion(db, ORG_A, 999)
      await nuevaRifa(db, ORG_A, 'la 1000')
      await db.query('savepoint duplicado')
      await expect(
        db.query(
          `insert into raffles (organization_id, name, ticket_price, status, start_date, end_date, created_by, short_code)
           values ($1, 'a mano', 1000, 'draft', '2026-01-01', '2026-12-31', $2, 'R1000')`,
          [ORG_A, ownerId],
        ),
      ).rejects.toMatchObject({ constraint: 'raffles_org_short_code_key' })
      await db.query('rollback to savepoint duplicado')
    })
  })

  it('un código escrito a mano se respeta y no consume contador', async () => {
    await enTransaccion(async () => {
      await nuevaOrganizacion(db, ORG_A, 999)
      const { rows } = await db.query<{ short_code: string }>(
        `insert into raffles (organization_id, name, ticket_price, status, start_date, end_date, created_by, short_code)
         values ($1, 'a mano', 1000, 'draft', '2026-01-01', '2026-12-31', $2, 'ESPECIAL')
         returning short_code`,
        [ORG_A, ownerId],
      )
      expect(rows[0]!.short_code).toBe('ESPECIAL')
      expect(await nuevaRifa(db, ORG_A, 'la 1000')).toBe('R1000')
    })
  })

  it('el código interno de las boletas hereda el de la rifa sin recortarlo', async () => {
    await enTransaccion(async () => {
      await nuevaOrganizacion(db, ORG_A, 999)
      const { rows: raffle } = await db.query<{ id: string }>(
        `insert into raffles (organization_id, name, ticket_price, status, start_date, end_date, created_by)
         values ($1, 'la 1000', 1000, 'draft', '2026-01-01', '2026-12-31', $2) returning id`,
        [ORG_A, ownerId],
      )
      // La boleta necesita un vendedor de ESTA organizacion: se le da una
      // membresia al dueño del seed, dentro de la misma transaccion.
      await db.query(
        `insert into memberships (organization_id, profile_id, role, is_active)
         values ($1, $2, 'seller', true)`,
        [ORG_A, ownerId],
      )
      const { rows } = await db.query<{ internal_code: string }>(
        `insert into tickets (organization_id, raffle_id, seller_id, created_by, daily_number, weekly_number, inventory_status)
         values ($1, $2, $3, $3, '0001', '0002', 'available') returning internal_code`,
        [ORG_A, raffle[0]!.id, ownerId],
      )
      expect(rows[0]!.internal_code).toBe('R1000-000001')
    })
  })

  it('los privilegios de la función siguen siendo los de 0032', async () => {
    const { rows } = await db.query<{ anon: boolean; auth: boolean; svc: boolean }>(
      `select has_function_privilege('anon', 'raffles_set_short_code()', 'EXECUTE') as anon,
              has_function_privilege('authenticated', 'raffles_set_short_code()', 'EXECUTE') as auth,
              has_function_privilege('service_role', 'raffles_set_short_code()', 'EXECUTE') as svc`,
    )
    expect(rows[0]).toEqual({ anon: false, auth: false, svc: true })
  })
})

describe('I-157 — dos rifas creadas a la vez al cruzar el 1.000', () => {
  afterAll(async () => {
    // Solo lo de ESTA prueba, por su organizacion. Lanza si algo queda.
    const limpieza = new PgClient({ connectionString: DB_URL })
    await limpieza.connect()
    try {
      await limpieza.query('begin')
      const { rows } = await limpieza.query<{ id: string }>(
        'select id from raffles where organization_id = $1',
        [ORG_CONC],
      )
      const ids = rows.map((row) => row.id)
      await limpieza.query('delete from seller_commissions where organization_id = $1', [ORG_CONC])
      await limpieza.query('delete from raffles where organization_id = $1', [ORG_CONC])
      await limpieza.query('delete from commission_tiers where organization_id = $1', [ORG_CONC])
      await limpieza.query(
        'delete from audit_logs where entity_id = any($1) or organization_id = $2',
        [ids, ORG_CONC],
      )
      const borrada = await limpieza.query('delete from organizations where id = $1', [ORG_CONC])
      if (borrada.rowCount !== 1) throw new Error('No se pudo borrar la organizacion de prueba')
      await limpieza.query('commit')
    } catch (error) {
      await limpieza.query('rollback')
      throw error
    } finally {
      await limpieza.end()
    }
  })

  it('reciben R1000 y R1001, nunca el mismo, y ninguna falla', async () => {
    await nuevaOrganizacion(db, ORG_CONC, 999)

    const a = new PgClient({ connectionString: DB_URL })
    const b = new PgClient({ connectionString: DB_URL })
    await Promise.all([a.connect(), b.connect()])
    try {
      await a.query('begin')
      await b.query('begin')
      // A toma el bloqueo del contador y no confirma todavia.
      const codigoA = await nuevaRifa(a, ORG_CONC, 'Concurrente A')
      // B tiene que esperar a A: se lanza y se deja pendiente.
      const pendienteB = nuevaRifa(b, ORG_CONC, 'Concurrente B')
      await new Promise((listo) => setTimeout(listo, 300))
      await a.query('commit')
      const codigoB = await pendienteB
      await b.query('commit')

      expect(codigoA).toBe('R1000')
      expect(codigoB).toBe('R1001')
    } finally {
      await Promise.all([a.end(), b.end()])
    }
  })
})
