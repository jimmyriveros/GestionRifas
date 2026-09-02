'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * Copiar al portapapeles, con su fallo contemplado (BR-K13).
 *
 * Vive aparte porque lo necesitan las DOS tarjetas del catalogo —la del panel
 * del vendedor y la de la ficha del vendedor en el portal administrativo— y
 * porque el caso que importa no es el exito, sino el fallo: `navigator.clipboard`
 * no existe en contexto inseguro (http sin localhost), puede estar bloqueado por
 * permisos, y en algunos navegadores rechaza si la llamada no viene de un gesto
 * de la persona.
 *
 * DEVUELVE SI PUDO, y no lanza. Quien llama decide qué decir, porque el mensaje
 * no es el mismo cuando se copia a peticion que cuando se copia porque compartir
 * falló. Lo que NUNCA se hace es dar por copiado algo que no se copió.
 *
 * `copied` vuelve solo a `false` a los dos segundos, para que el icono de
 * confirmacion no se quede fijo. El temporizador se cancela al copiar de nuevo:
 * sin eso, dos copias seguidas apagaban la marca de la segunda antes de tiempo.
 */
const COPIED_FEEDBACK_MS = 2000

export function useClipboard() {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      // `navigator.clipboard` es `undefined` en contexto inseguro: se comprueba
      // antes de llamarlo para no depender de que lance.
      if (typeof navigator === 'undefined' || !navigator.clipboard) return false
      await navigator.clipboard.writeText(text)

      if (timerRef.current !== null) clearTimeout(timerRef.current)
      setCopied(true)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        setCopied(false)
      }, COPIED_FEEDBACK_MS)

      return true
    } catch {
      return false
    }
  }, [])

  return { copy, copied }
}
