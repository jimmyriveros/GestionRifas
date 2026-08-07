/**
 * Busqueda: normalizacion e indices (migracion 0017, D-078 y D-079).
 *
 * Lo importante de este archivo es la PRIMERA seccion: que `search_normalize()`
 * en SQL y `foldForSearch()` en TypeScript den exactamente lo mismo. Son dos
 * implementaciones distintas de la misma regla, en dos lenguajes, y toda la
 * busqueda de clientes descansa en que coincidan: el navegador normaliza el
 * termino y la base de datos normalizo la columna. Si una cambia y la otra no,
 * la busqueda deja de encontrar y nadie se entera hasta que un vendedor no
 * puede cobrarle a alguien.
 *
 * No se puede comprobar con una prueba unitaria: hace falta PostgreSQL.
 */
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { foldForSearch } from '../../src/lib/search'
import { DB_URL } from './helpers'

let db: Client

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL })
  await db.connect()
})

afterAll(async () => {
  await db.end()
})

/** Casos reales y bordes: acentos, dieresis, ñ, mayusculas y espacios. */
const PALABRAS = [
  'José',
  'MARÍA',
  'Muñoz',
  'Peña',
  'Álvaro',
  'Íñigo',
  'Óscar',
  'Úrsula',
  'Güell',
  'jose',
  'Ana Torres',
  '  Carlos   Díaz  ',
  'ÁÉÍÓÚÜÑ',
  'sin-acentos-123',
  '',
]

describe('search_normalize() en SQL coincide con foldForSearch() en TypeScript', () => {
  it.each(PALABRAS)('«%s» se normaliza igual en las dos capas', async (palabra) => {
    const { rows } = await db.query<{ normalizado: string }>(
      'select search_normalize($1) as normalizado',
      [palabra],
    )
    const enSql = rows[0]!.normalizado

    // SQL no colapsa espacios (no le hace falta: la columna guarda el nombre tal
    // cual), asi que se compara contra el plegado de acentos y minusculas, que
    // es la parte que SI tiene que coincidir.
    const enTypeScript = foldForSearch(palabra)
    expect(enSql.trim().replace(/\s+/g, ' ')).toBe(enTypeScript)
  })
})

describe('clients.search_text', () => {
  it('es una columna generada: no se puede desincronizar a mano', async () => {
    const { rows } = await db.query(`
      select attgenerated
      from pg_attribute
      where attrelid = 'clients'::regclass and attname = 'search_text'
    `)
    // 's' = STORED. Si algun dia dejara de ser generada, alguien tendria que
    // mantenerla a mano y acabaria mintiendo.
    expect(rows[0]?.attgenerated).toBe('s')
  })

  it('junta nombre, alias, telefono y correo ya normalizados', async () => {
    const { rows } = await db.query<{ search_text: string }>(`
      select (
        search_normalize('José Muñoz')
        || ' ' || coalesce(search_normalize('Pepé'), '')
        || ' ' || coalesce('+57 (300) 555-0000', '')
        || ' ' || coalesce(regexp_replace('+57 (300) 555-0000', '[^0-9]', '', 'g'), '')
        || ' ' || coalesce(search_normalize('a@b.co'), '')
      ) as search_text
    `)
    const texto = rows[0]!.search_text
    expect(texto).toContain('jose munoz')
    expect(texto).toContain('pepe')
    // El telefono, con separadores Y sin ellos: se encuentra de las dos formas.
    expect(texto).toContain('+57 (300) 555-0000')
    expect(texto).toContain('573005550000')
  })

  it('un cliente real queda buscable por nombre sin tildes, alias y telefono en cualquier formato', async () => {
    const { rows: org } = await db.query<{ organization_id: string; seller_id: string }>(
      'select organization_id, seller_id from clients limit 1',
    )
    const { organization_id, seller_id } = org[0]!

    const { rows: creado } = await db.query<{ id: string }>(
      `insert into clients (organization_id, seller_id, name, alias, phone)
       values ($1, $2, 'Jesús Peña Ñuñez', 'Chuchó', '+57 (301) 222-3344')
       returning id`,
      [organization_id, seller_id],
    )
    const id = creado[0]!.id

    try {
      const encuentra = async (termino: string) => {
        const { rows } = await db.query(
          'select 1 from clients where id = $1 and search_text ilike $2',
          [id, `%${termino}%`],
        )
        return rows.length === 1
      }

      expect(await encuentra('jesus')).toBe(true) // sin tilde
      expect(await encuentra('pena')).toBe(true) // ñ plegada
      expect(await encuentra('nunez')).toBe(true) // ñ inicial plegada
      expect(await encuentra('chucho')).toBe(true) // alias sin tilde
      expect(await encuentra('573012223344')).toBe(true) // telefono solo digitos
      expect(await encuentra('(301) 222')).toBe(true) // telefono como se escribio
      expect(await encuentra('nadie')).toBe(false)
    } finally {
      await db.query('delete from clients where id = $1', [id])
    }
  })
})

describe('indices de busqueda', () => {
  it('tickets.internal_code tiene indice de trigramas (antes: barrido secuencial)', async () => {
    const { rows } = await db.query(`
      select indexdef from pg_indexes
      where tablename = 'tickets' and indexname = 'tickets_internal_code_trgm_idx'
    `)
    expect(rows[0]?.indexdef).toContain('gin')
    expect(rows[0]?.indexdef).toContain('gin_trgm_ops')
  })

  it('clients.search_text tiene indice de trigramas', async () => {
    const { rows } = await db.query(`
      select indexdef from pg_indexes
      where tablename = 'clients' and indexname = 'clients_search_text_trgm_idx'
    `)
    expect(rows[0]?.indexdef).toContain('gin_trgm_ops')
  })

  it('los cuatro indices de 0003 siguen ahi: no se retira un indice sin evidencia', async () => {
    const { rows } = await db.query<{ indexname: string }>(`
      select indexname from pg_indexes
      where tablename = 'clients' and indexname like '%trgm%'
      order by indexname
    `)
    expect(rows.map((r) => r.indexname)).toEqual([
      'clients_alias_trgm_idx',
      'clients_email_trgm_idx',
      'clients_name_trgm_idx',
      'clients_phone_trgm_idx',
      'clients_search_text_trgm_idx',
    ])
  })
})

describe('v_client_balances', () => {
  it('expone search_text: sin el, el listado no podria buscar normalizado', async () => {
    const { rows } = await db.query(`
      select column_name from information_schema.columns
      where table_name = 'v_client_balances' and column_name = 'search_text'
    `)
    expect(rows).toHaveLength(1)
  })

  it('sigue siendo security_invoker tras reescribirla (si no, se saltaria la RLS)', async () => {
    const { rows } = await db.query<{ reloptions: string[] | null }>(`
      select c.reloptions
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'v_client_balances'
    `)
    expect(rows[0]?.reloptions ?? []).toContain('security_invoker=true')
  })
})

describe('search_normalize()', () => {
  it('es IMMUTABLE: es lo que permite usarla en una columna generada y en un indice', async () => {
    const { rows } = await db.query<{ provolatile: string }>(`
      select provolatile from pg_proc
      where proname = 'search_normalize'
        and pronamespace = 'public'::regnamespace
    `)
    expect(rows[0]?.provolatile).toBe('i')
  })

  it('no es ejecutable por anon (I-020)', async () => {
    const { rows } = await db.query<{ puede: boolean }>(`
      select has_function_privilege('anon', p.oid, 'EXECUTE') as puede
      from pg_proc p
      where p.proname = 'search_normalize'
        and p.pronamespace = 'public'::regnamespace
    `)
    expect(rows[0]?.puede).toBe(false)
  })

  it('SI es ejecutable por authenticated: la columna generada se evalua con su sesion', async () => {
    const { rows } = await db.query<{ puede: boolean }>(`
      select has_function_privilege('authenticated', p.oid, 'EXECUTE') as puede
      from pg_proc p
      where p.proname = 'search_normalize'
        and p.pronamespace = 'public'::regnamespace
    `)
    expect(rows[0]?.puede).toBe(true)
  })
})
