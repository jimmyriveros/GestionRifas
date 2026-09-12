import { describe, expect, it } from 'vitest'

import { notificationHref, notificationMessage } from '@/features/notifications/text'

/**
 * El aviso de la campana cuando vence un recordatorio (BR-S09, BR-V01, D-189).
 *
 * LA CAMPANA ES LA FUENTE DURABLE del recordatorio: sin permiso de
 * notificaciones, sin navegador compatible o con el envío caído, este aviso
 * sigue existiendo y se ve al entrar. Por eso tiene que decir cuál de los
 * catorce posibles es, y llevar a donde se copia el mensaje.
 *
 * Y por eso mismo no puede decir de más: va a la campanita de una persona, pero
 * el texto que describe se pega en un grupo con TODOS sus clientes dentro.
 */
describe('aviso de recordatorio de pago vencido', () => {
  const data = {
    reminder_id: 'r1',
    weekday: 2,
    time_of_day: '19:00',
    scheduled_for: '2026-09-15T00:00:00.000Z',
  }

  it('dice cual de sus recordatorios es, y que hacer', () => {
    expect(notificationMessage('payment_reminder.due', data)).toBe(
      'Es hora de tu recordatorio del martes a las 7:00 p. m. Copia el mensaje y pégalo en tu grupo.',
    )
  })

  it('el dia va en minusculas porque va DENTRO de una frase', () => {
    const texto = notificationMessage('payment_reminder.due', { ...data, weekday: 7 })
    expect(texto).toContain('del domingo a las')
    expect(texto).not.toContain('Domingo')
  })

  it('sin dia ni hora sigue siendo una frase util, no un hueco', () => {
    expect(notificationMessage('payment_reminder.due', { reminder_id: 'r1' })).toBe(
      'Es hora de tu recordatorio de pago. Copia el mensaje y pégalo en tu grupo.',
    )
  })

  it('NO nombra a ningun cliente, saldo ni importe (BR-S09)', () => {
    // Lo que llega en `data` es lo unico que puede acabar en la frase, y el
    // motor solo manda cuatro claves. Aun asi se comprueba que un dato de mas
    // —si alguien ampliara el payload— no se cuele en el texto.
    const texto = notificationMessage('payment_reminder.due', {
      ...data,
      client_name: 'Ana Torres',
      pending_amount: 120000,
    })
    expect(texto).not.toContain('Ana Torres')
    expect(texto).not.toContain('120')
    expect(texto).not.toMatch(/\$/)
  })

  it('lleva a donde se copia el mensaje: es lo que lo hace accionable', () => {
    expect(notificationHref('payment_reminder.due')).toBe('/seller/settings/reminders')
  })

  it('los demas avisos NO llevan a ninguna parte', () => {
    // Cuentan algo que ya pasó y no hay nada que hacer con ellos. Inventarles
    // un destino convertiría una fila informativa en un botón que engaña.
    for (const kind of [
      'team.member_added',
      'team.sale',
      'lottery.result',
      'lottery.schedule_change',
      'desconocido',
    ]) {
      expect(notificationHref(kind), kind).toBeNull()
    }
  })
})
