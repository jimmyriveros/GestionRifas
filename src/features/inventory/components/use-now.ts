'use client'

import { useSyncExternalStore } from 'react'

/**
 * La hora para las cuentas atras de los apartados (D-257), en un tic de 15
 * segundos y AJUSTADA A LA HORA DE LA BASE.
 *
 * UN SOLO TEMPORIZADOR para toda la pantalla, y solo mientras alguien lo
 * escucha: con diez apartados en pantalla sigue habiendo un `setInterval`, no
 * diez. Es el patron de `selection-store.ts` y de `install-store.ts`: un almacen
 * fuera de React leido con `useSyncExternalStore`, que no rompe la hidratacion.
 *
 * EL RELOJ DEL TELEFONO NO MANDA. Cada lectura de los apartados trae la hora de
 * la base (`server_now`), y `syncNowWithServer` guarda la diferencia con el
 * telefono y vuelve a dar la hora en el acto. Sin eso, un telefono atrasado o un
 * tic de hace 14 segundos escribian «Quedan 31 minutos» en un apartado de 30
 * recien hecho. La diferencia se mide al llegar la respuesta, asi que el retraso
 * de la red la deja corta por unos cientos de milisegundos: la cuenta es en
 * minutos y no se nota.
 *
 * En el servidor —y en el primer pintado del navegador— vale 0: quien lo usa
 * enseña entonces solo la hora absoluta de vencimiento, que viene de la base y
 * no depende de ningun reloj del telefono.
 *
 * SOLO PARA MOSTRAR. Que un apartado vencio lo decide la base al confirmar
 * cualquier operacion, con su propia hora.
 */
const TICK_MS = 15_000

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
/** Hora de la base menos hora del telefono, la ultima vez que se midio. */
let offset = 0
let current = typeof window === 'undefined' ? 0 : Date.now()

function tick() {
  current = Date.now() + offset
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (timer === null) {
    current = Date.now() + offset
    timer = setInterval(tick, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

function getSnapshot(): number {
  return current
}

function getServerSnapshot(): number {
  return 0
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Ajusta el reloj de la pantalla a la hora que dio la base y la da ya. */
export function syncNowWithServer(serverNow: string): void {
  const server = Date.parse(serverNow)
  if (Number.isNaN(server)) return
  offset = server - Date.now()
  tick()
}
