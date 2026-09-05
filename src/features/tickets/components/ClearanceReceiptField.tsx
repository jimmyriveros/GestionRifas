'use client'

import { TicketCheckIcon, TicketIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Switch } from '@/components/ui/switch'
import { formatDateTimeEs } from '@/lib/dates'

import {
  CLEARANCE_COPY,
  clearanceDeliveredLabel,
  clearanceLabel,
  type ClearanceEligibility,
} from '../clearance-receipt'
import { setTicketClearanceDelivery } from '../actions'

type ClearanceReceiptFieldProps = {
  ticketId: string
} & Pick<ClearanceEligibility, 'clearanceDeliveredAt' | 'clearanceAssumedDelivered'>

/**
 * El interruptor del paz y salvo, en el detalle de la boleta (BR-I15, D-170).
 *
 * Solo lo monta el portal del VENDEDOR y solo sobre una boleta vendida: es su
 * entrega. El portal administrativo enseña el mismo dato en modo lectura, con su
 * propio bloque — pinta más (manual o carga inicial) y no pinta interruptor.
 *
 * OPTIMISTA, PERO SIN INVENTAR LA HORA. Al tocarlo, el estado se pinta de
 * inmediato y la fecha se sustituye por «Guardando…»: el reloj del teléfono no
 * es una fuente y escribir una hora que luego cambie sería peor que no escribir
 * ninguna. Cuando el servidor responde se pinta SU fecha, que es la buena. Si
 * falla, el interruptor vuelve a donde estaba y el error se dice.
 *
 * BLOQUEO OPTIMISTA. Lo que viaja es la fecha que esta pantalla creía. Si otra
 * sesión lo cambió entre medias, la base lo rechaza y se avisa: registrar una
 * entrega que ya se había retirado dejaría el dato diciendo lo contrario de lo
 * que pasó.
 *
 * ⚠️ EL ESTADO SE SIEMBRA DE LAS PROPS, así que la página TIENE que pasarle un
 * `key` que contenga el valor del servidor: el dato cambia también sin tocar
 * este interruptor —cambiar de cliente y liberar la boleta lo devuelven a
 * pendiente desde la base—, y sin `key` React conservaría el estado viejo.
 */
export function ClearanceReceiptField({
  ticketId,
  clearanceDeliveredAt,
  clearanceAssumedDelivered,
}: ClearanceReceiptFieldProps) {
  const router = useRouter()
  const switchId = useId()
  const titleId = useId()
  const helpId = useId()
  const [state, setState] = useState({
    deliveredAt: clearanceDeliveredAt,
    assumed: clearanceAssumedDelivered,
  })
  // Lo que se pinta mientras el servidor contesta. `null` = no hay nada en
  // vuelo, así que manda `state`.
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const [isPending, startTransition] = useTransition()

  const delivered = optimistic ?? state.deliveredAt !== null
  const Icon = delivered ? TicketCheckIcon : TicketIcon

  function toggle(next: boolean) {
    setOptimistic(next)
    startTransition(async () => {
      const result = await setTicketClearanceDelivery({
        ticketId,
        delivered: next,
        expectedDeliveredAt: state.deliveredAt,
      })
      setOptimistic(null)
      if ('error' in result) {
        // No hace falta deshacer nada: `state` no se tocó, así que al soltar la
        // suposición el interruptor vuelve solo a donde estaba.
        toast.error(result.error)
        return
      }
      setState({
        deliveredAt: result.data.clearanceDeliveredAt,
        assumed: result.data.clearanceAssumedDelivered,
      })
      // El indicador de la lista sale de la misma lectura: se refresca para que
      // el listado no se quede diciendo lo contrario al volver.
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p
            id={titleId}
            className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
          >
            {CLEARANCE_COPY.title}
          </p>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Icon
              className={
                delivered
                  ? 'size-4 shrink-0 text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground size-4 shrink-0'
              }
              aria-hidden
            />
            {clearanceLabel(delivered ? 'delivered' : 'pending')}
          </p>
          <ClearanceDetail
            isPending={isPending}
            deliveredAt={state.deliveredAt}
            assumed={state.assumed}
          />
        </div>

        {/* El interruptor mide 44 px de diana con el relleno, aunque el dibujo
            sea de 20: se toca con el dedo sin apuntar. Eso lo da la `label`,
            que hace clicable toda su área.

            La ETIQUETA ASOCIADA es el título VISIBLE, por `aria-labelledby`, y
            no un texto oculto dentro de la `label`: un duplicado `sr-only` haría
            que la frase estuviera dos veces en la pantalla —una de ellas
            invisible— y quien la escucha oiría lo mismo dos veces. El texto de
            ayuda va en `aria-describedby`. */}
        <label
          htmlFor={switchId}
          data-slot="clearance-switch-target"
          className="-my-2.5 -me-3 flex size-11 shrink-0 cursor-pointer items-center justify-center"
        >
          <Switch
            id={switchId}
            checked={delivered}
            disabled={isPending}
            onCheckedChange={toggle}
            aria-labelledby={titleId}
            aria-describedby={helpId}
          />
        </label>
      </div>

      {/* Lo único que la pantalla no enseña: qué NO cambia al moverlo. */}
      <p id={helpId} className="text-muted-foreground mt-2 text-xs">
        {CLEARANCE_COPY.help}
      </p>
    </div>
  )
}

/**
 * La línea de debajo del estado: cuándo se entregó, o por qué no hay fecha.
 *
 * Una boleta por entregar no escribe nada aquí: no hay dato que dar y una raya
 * ocuparía sitio sin decir nada.
 */
function ClearanceDetail({
  isPending,
  deliveredAt,
  assumed,
}: {
  isPending: boolean
  deliveredAt: string | null
  assumed: boolean
}) {
  if (isPending) {
    return <p className="text-muted-foreground text-xs">{CLEARANCE_COPY.saving}</p>
  }
  if (deliveredAt === null) return null
  if (assumed) {
    // NUNCA la fecha de la migración: es técnica y presentarla como la de la
    // entrega sería inventar el dato que falta (D-170).
    return <p className="text-muted-foreground text-xs">{CLEARANCE_COPY.assumedNote}</p>
  }
  return (
    <p className="text-muted-foreground text-xs">
      {clearanceDeliveredLabel(formatDateTimeEs(deliveredAt))}
    </p>
  )
}
