import { ticketLabel } from '@/lib/tickets'

/**
 * El texto de cada aviso.
 *
 * TODOS los textos de avisos viven aqui, igual que los del recorrido guiado
 * viven en `tours.ts` (UX_COPY_GUIDELINES, Anexo B). La base de datos guarda
 * que paso y con que datos; la frase se arma aqui, para que mejorar una
 * redaccion sea cambiar este archivo y no aplicar una migracion a produccion
 * (I-030).
 *
 * Reglas de §13 de la guia: una idea por aviso, frase corta, sin lenguaje
 * tecnico. Nada de «sub-vendedor»: en pantalla todos son vendedores y unos
 * tienen equipo (Anexo A).
 */

export type NotificationKind = 'team.member_added' | 'team.sale'

type NotificationData = Record<string, unknown>

function text(data: NotificationData, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' && value !== '' ? value : null
}

export function notificationMessage(kind: string, data: NotificationData): string {
  switch (kind) {
    case 'team.member_added': {
      const parent = text(data, 'parent_name') ?? 'Un vendedor'
      const member = text(data, 'member_name') ?? 'un vendedor'
      return data.is_first === true
        ? `${parent} armó su equipo y agregó a ${member}.`
        : `${parent} agregó a ${member} a su equipo.`
    }

    case 'team.sale': {
      const seller = text(data, 'seller_name') ?? 'Un vendedor'
      const numbers = ticketLabel({
        dailyNumber: text(data, 'daily_number'),
        weeklyNumber: text(data, 'weekly_number'),
      })
      return `${seller} vendió la boleta ${numbers}.`
    }

    default:
      // Un aviso de un tipo que esta version no conoce: se muestra algo
      // honesto en vez de una cadena vacia o el nombre tecnico del evento.
      return 'Novedad en tu equipo.'
  }
}
