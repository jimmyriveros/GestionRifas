import { NextResponse, type NextRequest } from 'next/server'

import { authorizePushDispatchRequest } from '@/features/push/auth'
import { runPushDispatch } from '@/features/push/dispatch'

/**
 * El despachador de avisos (BR-V08, D-187, D-191).
 *
 * POR QUE VIVE FUERA DE `(protected)`
 *
 * Un Route Handler **no hereda la guarda de su layout** (D-060). Quien lo llama
 * no trae sesión —es el `pg_cron` de la base, por `pg_net`—, así que se autoriza
 * con un secreto de servidor comparado a tiempo constante, y `/api/push/dispatch`
 * entra en `PUBLIC_PATHS` para que el proxy no lo mande a `/login`.
 *
 * ES EL MISMO PATRÓN DE `/api/lottery/sync`, deliberadamente: secreto por
 * cabecera y **nunca por la URL**, longitud mínima, limitación de intentos y
 * **fallo cerrado** si no está configurado. Lo único que no se comparte es el
 * cupo de intentos: dos puertas distintas no pueden cerrarse la una a la otra.
 *
 * NO ACEPTA NADA DEL QUE LLAMA. Ni identificadores, ni destinatarios, ni
 * cuerpos: lo único que hace es vaciar la cola que ya está escrita. Un
 * despachador que aceptara «a quién enviar» sería una forma de mandar
 * notificaciones a cualquiera.
 *
 * NO DEVUELVE NADA DE NADIE. El resumen son recuentos: cuántas salieron,
 * cuántas se reintentan, cuántas suscripciones murieron. Ni un endpoint, ni un
 * nombre, ni un identificador.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const UNAUTHORIZED = { error: 'No autorizado.' }
const FAILURE = { error: 'No se pudo despachar.' }

async function handle(request: NextRequest) {
  const auth = authorizePushDispatchRequest(request)
  if (!auth.ok) {
    return NextResponse.json(UNAUTHORIZED, { status: auth.status })
  }

  // Sonda de vida, igual que la de loterías: comprueba que el secreto vale sin
  // tocar la cola.
  if (request.nextUrl.searchParams.get('probe') === '1') {
    return NextResponse.json({ ok: true, probe: true })
  }

  try {
    const summary = await runPushDispatch()
    return NextResponse.json({ ok: true, ...summary })
  } catch {
    // Sin detalle: un error de base de datos no se le cuenta a quien llama.
    return NextResponse.json(FAILURE, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
