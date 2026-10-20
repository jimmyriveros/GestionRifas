'use client'

import { useCallback, useRef, useState } from 'react'

import { processTicketGenerationChunk, type GenerationProgress } from '../actions'
import { INVENTORY_COPY } from '../copy'

/**
 * Procesa una generacion bloque a bloque hasta terminarla (D-257, BR-N18).
 *
 * UNA PETICION POR BLOQUE, una detras de otra: cada una es una transaccion de la
 * base de hasta 5.000 boletas, lejos del tope de 8 s de una sesion. El avance
 * que se manda es el ULTIMO CONFIRMADO por la base; si una respuesta se pierde y
 * el bloque ya se habia guardado, la base responde con el avance real y se
 * sigue desde ahi, sin duplicar ni saltarse nada.
 *
 * Si algo falla, se detiene y lo dice: lo ya creado se queda, y `runFrom` con el
 * ultimo avance continua donde quedo. No reintenta solo: un error que se repite
 * no se arregla insistiendo, y la persona tiene que saber que paso.
 *
 * Una sola vuelta a la vez: un segundo `runFrom` mientras la primera corre no
 * hace nada (dos pestanas pueden correr la misma generacion, y la base las pone
 * en fila; pero en UNA pantalla no tiene sentido).
 */
export function useGenerationRunner() {
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  const runFrom = useCallback(async (initial: GenerationProgress): Promise<GenerationProgress> => {
    if (busy.current) return initial
    busy.current = true
    setRunning(true)
    setError(null)
    setProgress(initial)

    let current = initial
    try {
      while (current.status !== 'completed') {
        const result = await processTicketGenerationChunk({
          runId: current.runId,
          processedCount: current.processedCount,
        })
        if ('error' in result) {
          setError(result.error)
          break
        }
        // Un bloque que no avanzo y no termino seria una vuelta sin fin.
        if (
          result.data.status !== 'completed' &&
          result.data.processedCount <= current.processedCount
        ) {
          setError(INVENTORY_COPY.generator.stalled)
          break
        }
        current = result.data
        setProgress(current)
      }
    } catch {
      setError(INVENTORY_COPY.generator.connectionLost)
    } finally {
      busy.current = false
      setRunning(false)
    }
    return current
  }, [])

  return { progress, running, error, runFrom, setProgress }
}
