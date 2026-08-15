/**
 * Corregir a un integrante mientras su invitacion sigue pendiente (0026).
 *
 * Lo que se prueba aqui es lo que no se puede ver en la pantalla: que el estado
 * «pendiente» dependa de la contrasena y no de haber abierto un correo, que un
 * vendedor no pueda tocar el equipo de otro por mucho que llame a la RPC a mano,
 * y —lo mas importante— que corregir el correo deje SIN VALOR la invitacion
 * anterior. Ese ultimo punto es una propiedad de GoTrue, no del esquema, y por
 * eso se comprueba de verdad: si una version futura de Auth dejara de rotar el
 * token, este archivo es lo que avisa (D-097).
 *
 * Ninguna prueba usa la service role para el ACTO probado (D-043): se usa solo
 * para preparar y limpiar el escenario.
 *
 * Reglas cubiertas: BR-E14, BR-E15, BR-E16, BR-E17, BR-E18, BR-E19.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  anonClient,
  loadSeedContext,
  randomNumbers,
  SEED_PASSWORD,
  signInAs,
  USERS,
  type Client,
} from './helpers'

const MAILPIT = 'http://127.0.0.1:54324'

let ctx: Awaited<ReturnType<typeof loadSeedContext>>

/** Vendedor padre propio de esta suite; nunca una cuenta del seed (I-035). */
let parentId: string
let parent: Client
let seller2: Client

/** Todo lo creado aqui, para dejar la base como estaba. */
const createdProfileIds: string[] = []
const createdTicketIds: string[] = []

/** Alta por INVITACION: nace sin contrasena, que es el estado pendiente. */
async function invite(email: string, fullName: string): Promise<string> {
  const { data, error } = await ctx.svc.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, phone: '3001234567' },
    redirectTo: 'http://127.0.0.1:3000/auth/callback?next=/reset-password',
  })
  if (error) throw new Error(`No se pudo invitar a ${email}: ${error.message}`)
  createdProfileIds.push(data.user.id)
  return data.user.id
}

/** Alta con contrasena, como el seed y el resto de las suites. */
async function createWithPassword(email: string, fullName: string): Promise<string> {
  const { data, error } = await ctx.svc.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: '3001234567' },
  })
  if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
  await ctx.svc.auth.admin.updateUserById(data.user.id, { password: SEED_PASSWORD })
  createdProfileIds.push(data.user.id)
  return data.user.id
}

/** Mete a alguien en el equipo de `parentId`, con la service role. */
async function addToTeam(profileId: string): Promise<void> {
  const { error } = await ctx.svc.from('memberships').insert({
    organization_id: ctx.demoOrg.id,
    profile_id: profileId,
    role: 'seller',
    parent_seller_id: parentId,
    invited_by: parentId,
  })
  if (error) throw error
}

/** Un integrante nuevo, pendiente de activar, listo para usar. */
async function pendingMember(prefix: string): Promise<{ id: string; email: string }> {
  const email = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@demo.test`
  const id = await invite(email, 'Integrante Pendiente')
  await addToTeam(id)
  return { id, email }
}

async function activatedAt(profileId: string): Promise<string | null> {
  const { data } = await ctx.svc
    .from('profiles')
    .select('activated_at')
    .eq('id', profileId)
    .single()
  return data!.activated_at
}

/**
 * Lo que hace de verdad quien recibe la invitacion: define su contrasena y con
 * eso su cuenta queda configurada.
 *
 * Los dos pasos son el flujo real. `updateUserById` es lo que Auth hace cuando
 * la persona guarda su contrasena en `/reset-password`; `mark_profile_activated`
 * es lo que hace despues la Server Action `resetPassword`. Simularlo escribiendo
 * `activated_at` con la service role no probaria nada (D-043).
 */
async function activate(profileId: string, email: string): Promise<void> {
  // `email_confirm` porque abrir el enlace es parte del camino: sin eso Auth ni
  // siquiera deja iniciar sesion («Email not confirmed»).
  await ctx.svc.auth.admin.updateUserById(profileId, {
    password: SEED_PASSWORD,
    email_confirm: true,
  })
  const session = await signInAs(email)
  const { error } = await session.rpc('mark_profile_activated')
  if (error) throw error
}

/** Enlaces de los correos que recibio esa direccion, los mas nuevos primero. */
async function mailLinks(to: string): Promise<string[]> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`)
  const body = (await res.json()) as { messages: { ID: string; To: { Address: string }[] }[] }
  const links: string[] = []
  for (const m of body.messages.filter((msg) => msg.To.some((t) => t.Address === to))) {
    const full = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
      Text: string
    }
    for (const match of full.Text.matchAll(/https?:\/\/[^\s"'<>]+/g)) links.push(match[0])
  }
  return links
}

beforeAll(async () => {
  ctx = await loadSeedContext()

  const parentEmail = `padre-ciclo-${Date.now().toString(36)}@demo.test`
  parentId = await createWithPassword(parentEmail, 'Padre Ciclo')
  const { error } = await ctx.svc.from('memberships').insert({
    organization_id: ctx.demoOrg.id,
    profile_id: parentId,
    role: 'seller',
  })
  if (error) throw error

  parent = await signInAs(parentEmail)
  seller2 = await signInAs(USERS.seller2)
})

afterAll(async () => {
  if (createdTicketIds.length > 0) {
    await ctx.svc.from('tickets').delete().in('id', createdTicketIds)
  }
  if (createdProfileIds.length > 0) {
    await ctx.svc.from('memberships').delete().in('profile_id', createdProfileIds)
    for (const id of createdProfileIds) {
      await ctx.svc.auth.admin.deleteUser(id)
    }
  }
})

describe('E2 — cuando una cuenta cuenta como activada (BR-E14)', () => {
  it('E2-01: invitar deja la cuenta pendiente; crearla con contraseña la deja activada', async () => {
    const invitado = await invite(`pend-${Date.now().toString(36)}@demo.test`, 'Sin Contrasena')
    expect(await activatedAt(invitado)).toBeNull()

    const conClave = await createWithPassword(
      `act-${Date.now().toString(36)}@demo.test`,
      'Con Clave',
    )
    expect(await activatedAt(conClave)).not.toBeNull()
  })

  it('E2-02: abrir el correo NO activa la cuenta, aunque Auth le ponga contraseña', async () => {
    // La prueba que tumbó el primer diseño, y la razón de que `activated_at` lo
    // marque la aplicación y no un trigger sobre `auth.users`: al verificar el
    // enlace, GoTrue escribe un hash aleatorio en `encrypted_password`. Quien
    // solo abrió el correo sigue pendiente (encargo, «Importante sobre el
    // estado»).
    const email = `activa-${Date.now().toString(36)}@demo.test`
    const id = await invite(email, 'Activa Prueba')

    const enlaces = await mailLinks(email)
    const url = new URL(enlaces[0]!)
    const { error: otpError } = await anonClient().auth.verifyOtp({
      token_hash: url.searchParams.get('token')!,
      type: 'invite',
    })
    expect(otpError).toBeNull()

    const { data: authRow } = await ctx.svc.auth.admin.getUserById(id)
    expect(authRow.user?.email_confirmed_at, 'Auth sí dio por confirmado el correo').toBeTruthy()
    expect(await activatedAt(id), 'pero la cuenta sigue pendiente').toBeNull()

    // Terminar de configurarla: ahora sí.
    await activate(id, email)
    expect(await activatedAt(id)).not.toBeNull()
  })

  it('E2-03: cambiar la contraseña después no mueve la fecha original', async () => {
    const email = `fecha-${Date.now().toString(36)}@demo.test`
    const id = await createWithPassword(email, 'Fecha Fija')
    const primera = await activatedAt(id)

    const session = await signInAs(email)
    const { error } = await session.rpc('mark_profile_activated')
    expect(error).toBeNull()

    expect(await activatedAt(id)).toBe(primera)
  })

  it('E2-03b: `mark_profile_activated` solo habla de quien la llama', async () => {
    // No recibe argumentos: no existe forma de marcar la cuenta de otro.
    const { id } = await pendingMember('ajeno-activa')

    const { error } = await parent.rpc('mark_profile_activated')
    expect(error).toBeNull()
    expect(await activatedAt(id), 'el integrante sigue pendiente').toBeNull()
  })

  it('E2-04: el backfill dejó activadas las cuentas que ya existían', async () => {
    // Si esto fallara, cada vendedor de produccion apareceria como «invitación
    // pendiente» y pasaria a ser borrable por su vendedor padre.
    const { data } = await ctx.svc
      .from('profiles')
      .select('email, activated_at')
      .in('id', [ctx.ids.owner, ctx.ids.admin, ctx.ids.seller1, ctx.ids.seller2])

    expect(data).toHaveLength(4)
    for (const row of data!) {
      expect(row.activated_at, row.email).not.toBeNull()
    }
  })
})

describe('E2 — corregir los datos de un integrante (BR-E15)', () => {
  it('E2-05: el vendedor padre corrige nombre, alias y celular', async () => {
    const { id } = await pendingMember('corrige')

    const { error } = await parent.rpc('team_update_member', {
      p_member_id: id,
      p_full_name: 'Nombre Corregido',
      p_alias: 'Corregido',
      p_phone: '3009998877',
    })
    expect(error).toBeNull()

    const { data } = await ctx.svc
      .from('profiles')
      .select('full_name, alias, phone')
      .eq('id', id)
      .single()
    expect(data).toMatchObject({
      full_name: 'Nombre Corregido',
      alias: 'Corregido',
      phone: '3009998877',
    })
  })

  it('E2-06: un vendedor no puede corregir a un integrante de otro equipo', async () => {
    const { id } = await pendingMember('ajeno')

    const { error } = await seller2.rpc('team_update_member', {
      p_member_id: id,
      p_full_name: 'Intruso Editor',
      p_alias: '',
      p_phone: '3001112233',
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no es de tu equipo/i)

    const { data } = await ctx.svc.from('profiles').select('full_name').eq('id', id).single()
    expect(data!.full_name).not.toBe('Intruso Editor')
  })

  it('E2-07: quien no lidera un equipo no puede tocar a nadie', async () => {
    const { id } = await pendingMember('sinequipo')
    const { error } = await (
      await signInAs(USERS.otherOrgSeller)
    ).rpc('team_update_member', {
      p_member_id: id,
      p_full_name: 'Otra Organizacion',
      p_alias: '',
      p_phone: '3001112233',
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no es de tu equipo/i)
  })

  it('E2-08: la puerta directa a `profiles` sigue cerrada para el vendedor padre', async () => {
    // La corrección es por función a propósito: `authenticated` tiene UPDATE
    // sobre todas las columnas, así que una política habría dejado además
    // reescribir `is_active` de un integrante.
    const { id } = await pendingMember('directo')

    const { data, error } = await parent
      .from('profiles')
      .update({ full_name: 'Por la puerta de atras', is_active: false })
      .eq('id', id)
      .select('id')

    expect(error).toBeNull()
    expect(data, 'ninguna fila actualizada').toHaveLength(0)
  })

  it('E2-09: `team_member_guard` no es ejecutable por un usuario cualquiera', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (parent as any).rpc('team_member_guard', { p_member_id: parentId })
    expect(error).not.toBeNull()
  })
})

describe('E2 — corregir el correo antes de activar (BR-E16)', () => {
  it('E2-10: la invitación anterior deja de funcionar cuando se corrige el correo', async () => {
    // La prueba central de todo el trabajo. Recorre el camino completo: se
    // invita a una dirección equivocada, se guarda su enlace, se corrige el
    // correo y se vuelve a invitar. Solo la invitación nueva debe servir.
    const stamp = Date.now().toString(36)
    const malo = `gmial-${stamp}@demo.test`
    const bueno = `gmail-${stamp}@demo.test`

    const id = await invite(malo, 'Correo Equivocado')
    await addToTeam(id)
    const enlaceViejo = (await mailLinks(malo))[0]!
    expect(enlaceViejo).toBeTruthy()

    // 1. La base de datos autoriza el cambio y devuelve el correo anterior.
    const { data, error } = await parent
      .rpc('team_update_member', {
        p_member_id: id,
        p_full_name: 'Correo Equivocado',
        p_alias: '',
        p_phone: '3001234567',
        p_email: bueno,
      })
      .single()

    expect(error).toBeNull()
    expect(data!.rotate_invitation).toBe(true)
    expect(data!.previous_email).toBe(malo)

    // La función NO escribe el correo: la fuente de verdad es Auth.
    const { data: sinCambiar } = await ctx.svc
      .from('profiles')
      .select('email')
      .eq('id', id)
      .single()
    expect(sinCambiar!.email).toBe(malo)

    // 2. Lo que hace la Server Action: Auth y nueva invitación.
    const { error: authError } = await ctx.svc.auth.admin.updateUserById(id, { email: bueno })
    expect(authError).toBeNull()

    const { error: inviteError } = await ctx.svc.auth.admin.inviteUserByEmail(bueno, {
      data: { full_name: 'Correo Equivocado', phone: '3001234567' },
      redirectTo: 'http://127.0.0.1:3000/auth/callback?next=/reset-password',
    })
    expect(inviteError).toBeNull()

    // El trigger de 0001 copió el correo nuevo al perfil.
    const { data: perfil } = await ctx.svc.from('profiles').select('email').eq('id', id).single()
    expect(perfil!.email).toBe(bueno)

    // 3. Y ahora lo que importa: el enlace viejo ya no abre nada.
    const viejo = new URL(enlaceViejo)
    const { error: viejoError } = await anonClient().auth.verifyOtp({
      token_hash: viejo.searchParams.get('token')!,
      type: 'invite',
    })
    expect(viejoError, 'el enlace anterior debe quedar invalidado').not.toBeNull()

    // Mientras que el nuevo sí.
    const enlaceNuevo = new URL((await mailLinks(bueno))[0]!)
    const { error: nuevoError } = await anonClient().auth.verifyOtp({
      token_hash: enlaceNuevo.searchParams.get('token')!,
      type: 'invite',
    })
    expect(nuevoError, 'la invitación nueva debe funcionar').toBeNull()
  })

  it('E2-11: el mismo correo no pide invitación nueva', async () => {
    const { id, email } = await pendingMember('mismo')

    const { data, error } = await parent
      .rpc('team_update_member', {
        p_member_id: id,
        p_full_name: 'Sin Cambio',
        p_alias: '',
        p_phone: '3001234567',
        // En mayusculas: el correo se normaliza, no se compara literal.
        p_email: email.toUpperCase(),
      })
      .single()

    expect(error).toBeNull()
    expect(data!.rotate_invitation).toBe(false)
  })

  it('E2-12: con la cuenta activada, el correo ya no se puede cambiar', async () => {
    const { id, email } = await pendingMember('activado')
    await activate(id, email)

    const { error } = await parent.rpc('team_update_member', {
      p_member_id: id,
      p_full_name: 'Ya Activo',
      p_alias: '',
      p_phone: '3001234567',
      p_email: `otro-${Date.now().toString(36)}@demo.test`,
    })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
    expect(error!.message).toMatch(/ya activó su cuenta/i)
  })

  it('E2-13: nombre, alias y celular siguen siendo editables después de activar', async () => {
    const { id, email } = await pendingMember('editable')
    await activate(id, email)

    const { error } = await parent.rpc('team_update_member', {
      p_member_id: id,
      p_full_name: 'Activo Editado',
      p_alias: 'Editado',
      p_phone: '3007776655',
    })

    expect(error).toBeNull()
    const { data } = await ctx.svc.from('profiles').select('full_name').eq('id', id).single()
    expect(data!.full_name).toBe('Activo Editado')
  })

  it('E2-14: un correo que ya es de otra persona se rechaza', async () => {
    const { id } = await pendingMember('duplicado')

    const { error } = await parent.rpc('team_update_member', {
      p_member_id: id,
      p_full_name: 'Duplicado',
      p_alias: '',
      p_phone: '3001234567',
      p_email: USERS.seller1,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/ya pertenece a otra persona/i)
  })

  it('E2-15: `team_confirm_email_change` rechaza si la cuenta se activó por el camino', async () => {
    // La carrera real: la persona configura su contraseña justo entre la
    // autorización y el cambio. La aplicación devuelve el correo anterior.
    const { id, email } = await pendingMember('carrera')
    await activate(id, email)

    const { error } = await parent.rpc('team_confirm_email_change', {
      p_member_id: id,
      p_previous_email: email,
      p_new_email: `tarde-${Date.now().toString(36)}@demo.test`,
    })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/activó su cuenta/i)
  })
})

describe('E2 — eliminar un alta equivocada (BR-E17, BR-E18)', () => {
  it('E2-16: el vendedor padre elimina a un integrante que nunca activó', async () => {
    const { id } = await pendingMember('borrar')

    const { error } = await parent.rpc('team_delete_member', { p_member_id: id })
    expect(error).toBeNull()

    const { data } = await ctx.svc.from('memberships').select('id').eq('profile_id', id)
    expect(data, 'la membresía desaparece').toHaveLength(0)
  })

  it('E2-17: borrar la cuenta de Auth se lleva el perfil y la invitación', async () => {
    const stamp = Date.now().toString(36)
    const email = `cascada-${stamp}@demo.test`
    const id = await invite(email, 'Se Borra')
    await addToTeam(id)
    const enlace = new URL((await mailLinks(email))[0]!)

    const { error } = await parent.rpc('team_delete_member', { p_member_id: id })
    expect(error).toBeNull()

    // Lo que hace la Server Action después de la RPC.
    const { error: authError } = await ctx.svc.auth.admin.deleteUser(id)
    expect(authError).toBeNull()

    const { data: perfil } = await ctx.svc.from('profiles').select('id').eq('id', id)
    expect(perfil, 'el perfil se va en cascada').toHaveLength(0)

    const { error: otpError } = await anonClient().auth.verifyOtp({
      token_hash: enlace.searchParams.get('token')!,
      type: 'invite',
    })
    expect(otpError, 'la invitación de una cuenta borrada no sirve').not.toBeNull()
  })

  it('E2-18: quien ya activó su cuenta no se elimina, se desactiva', async () => {
    const { id, email } = await pendingMember('noborrar')
    await activate(id, email)

    const { error } = await parent.rpc('team_delete_member', { p_member_id: id })

    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
    expect(error!.message).toMatch(/desactive/i)

    const { data } = await ctx.svc.from('memberships').select('id').eq('profile_id', id)
    expect(data).toHaveLength(1)
  })

  it('E2-19: con boletas a su nombre tampoco se elimina', async () => {
    const { id } = await pendingMember('conboletas')
    const numbers = randomNumbers()
    const { data: ticket, error: ticketError } = await ctx.svc
      .from('tickets')
      .insert({
        organization_id: ctx.demoOrg.id,
        raffle_id: ctx.demoRaffle.id,
        seller_id: id,
        daily_number: numbers.daily,
        weekly_number: numbers.weekly,
        inventory_status: 'available',
        created_by: ctx.ids.owner,
      })
      .select('id')
      .single()
    if (ticketError) throw ticketError
    createdTicketIds.push(ticket!.id)

    const { error } = await parent.rpc('team_delete_member', { p_member_id: id })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/boletas a su nombre/i)
  })

  it('E2-20: un vendedor no puede eliminar a un integrante de otro equipo', async () => {
    const { id } = await pendingMember('ajenoborrar')

    const { error } = await seller2.rpc('team_delete_member', { p_member_id: id })

    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no es de tu equipo/i)

    const { data } = await ctx.svc.from('memberships').select('id').eq('profile_id', id)
    expect(data).toHaveLength(1)
  })
})

describe('E2 — rastro administrativo (BR-E19)', () => {
  it('E2-21: corregir, cambiar de correo y eliminar quedan en la bitácora', async () => {
    const { id, email } = await pendingMember('bitacora')
    const nuevo = `bitacora-nuevo-${Date.now().toString(36)}@demo.test`

    await parent.rpc('team_update_member', {
      p_member_id: id,
      p_full_name: 'Con Bitacora',
      p_alias: '',
      p_phone: '3001234567',
    })
    await parent.rpc('team_confirm_email_change', {
      p_member_id: id,
      p_previous_email: email,
      p_new_email: nuevo,
    })
    await parent.rpc('team_delete_member', { p_member_id: id })

    const { data } = await ctx.svc
      .from('audit_logs')
      .select('action, actor_profile_id')
      .eq('entity_id', id)
      .order('created_at', { ascending: true })

    const acciones = (data ?? []).map((row) => row.action)
    expect(acciones).toContain('user.update')
    expect(acciones).toContain('user.email_change')
    expect(acciones).toContain('user.delete')
    // El actor es el vendedor padre, no un proceso anónimo.
    expect(data!.every((row) => row.actor_profile_id === parentId)).toBe(true)
  })
})
