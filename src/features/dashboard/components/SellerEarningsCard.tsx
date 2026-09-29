import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EARNINGS_COPY } from '@/features/commissions/copy'
import { formatCOP } from '@/lib/money'
import { cn } from '@/lib/utils'

type SellerEarningsCardProps = {
  /** Lo que gana el vendedor por cada boleta que cobre completa (BR-G01). */
  earningPerTicket: number
  /** Precio vigente de la rifa. `null` si no hay ninguna activa. */
  ticketPrice: number | null
  /** Ganancia ya conseguida en esa rifa por lo que vendio EL MISMO. */
  earned: number
  /**
   * Lo que le deja su equipo en esa rifa (BR-G20). Cero para quien no tiene
   * equipo, y entonces la linea no se dibuja.
   *
   * Va aparte de `earned` y no sumado dentro: son dinero de distinta
   * procedencia, y un vendedor que arma equipo necesita ver cuanto le aporta
   * —es la respuesta a «¿para qué me sirve tener equipo?»—. Sumadas en una sola
   * cifra, esa pregunta no tendria respuesta en ninguna pantalla.
   */
  teamEarned: number
  /**
   * Las dos cosas juntas, tal como las da el servidor (`totalEarned`). Solo se
   * escribe cuando hay de las dos: con una sola, repetiria la misma cifra.
   */
  totalEarned: number
  /**
   * Las boletas que deciden su tramo, cuando su equipo ya cuenta (BR-G27):
   * las suyas mas las de su equipo. `null` si no aplica: sin tramos, o sin nada
   * cobrado por su equipo, el conteo es el de sus propias boletas y no hay nada
   * que explicar.
   */
  tierCount: number | null
  /**
   * Siguiente tramo, para quien cobra por tramos y todavia tiene uno por
   * delante (BR-G02). `null` en los demas casos: quien cobra la mitad del
   * precio o un fijo no tiene tramos que subir, y quien ya llego arriba tampoco.
   */
  nextTier: { ticketsToNext: number; rate: number } | null
  /** Si lo que cobra su equipo ya cuenta para su tramo: cambia la frase. */
  teamCounts: boolean
  className?: string
}

/**
 * «Ganancia por boleta»: el dinero DEL VENDEDOR, no el de sus clientes.
 *
 * DE DONDE SALE. Era el cuarto indicador de la fila superior del panel (D-112),
 * y es el UNICO de los cuatro que no repetia una cifra de «Estado de cobro»:
 * los otros tres —«Recaudado», «Por cobrar» y «Cobranza»— contaban el dinero de
 * las boletas, que es de lo que habla esa seccion entera. Este cuenta lo que se
 * queda quien vende, y por eso sobrevive con region propia en vez de
 * desaparecer con ellos.
 *
 * POR QUE NO ENTRA EN «ESTADO DE COBRO». Alli todo el dinero es el mismo
 * —lo que valen las boletas vendidas, repartido—, y meter dentro una cifra que
 * significa otra cosa es exactamente el error que D-171 vino a corregir. Se
 * queda fuera, y se lee como lo que es.
 *
 * PROPIO, EQUIPO Y TOTAL (D-237). Quien tiene equipo lee las tres cifras por
 * separado: lo que gano por sus boletas, lo que le dejo su equipo y la suma.
 * Y si cobra por tramos, la tarjeta le dice que su tramo cuenta tambien las
 * boletas de su equipo, que es lo unico que la cifra de arriba no explica: un
 * jefe puede subir de tramo sin haber vendido nada ese dia.
 */
export function SellerEarningsCard({
  earningPerTicket,
  ticketPrice,
  earned,
  teamEarned,
  totalEarned,
  tierCount,
  nextTier,
  teamCounts,
  className,
}: SellerEarningsCardProps) {
  const copy = EARNINGS_COPY.seller
  const withTeam = teamEarned > 0

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>
          <h2 className="text-heading-h4">Ganancia por boleta</h2>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* La cifra va PEGADA al titulo, y el precio de la rifa debajo con las
            demas. Puesto como descripcion de la tarjeta, un numero que no es el
            tuyo —lo que cuesta la boleta— quedaba encima del que si lo es. */}
        <p className="text-metric-large tabular-nums">{formatCOP(earningPerTicket)}</p>

        {/* El bloque entero se calla cuando no hay ninguna linea: sin rifa
            activa y sin boletas cobradas no hay nada que contar, y un hueco
            vacio bajo la cifra parece algo que no cargo. */}
        <div className="text-muted-foreground text-body-small space-y-1 empty:hidden">
          {ticketPrice === null ? null : (
            <p className="tabular-nums">Precio de la boleta: {formatCOP(ticketPrice)}</p>
          )}
          {/* Lo GANADO, que era el titular de la tarjeta grande que
              desaparecio: sin esta linea, quien cobra por tramos perderia de
              vista lo unico que de verdad es suyo. */}
          {earned > 0 ? <p className="tabular-nums">{copy.ownEarned(earned, withTeam)}</p> : null}
          {/* Lo que le deja el equipo, en su propia linea (BR-G20). La cifra de
              arriba dice lo que gana por CADA boleta suya, y esto no cabe ahi:
              son boletas de otras personas. */}
          {withTeam ? <p className="tabular-nums">{copy.teamEarned(teamEarned)}</p> : null}
          {earned > 0 && withTeam ? (
            <p className="text-foreground font-medium tabular-nums">
              {copy.totalEarned(totalEarned)}
            </p>
          ) : null}
          {tierCount === null ? null : <p className="tabular-nums">{copy.tierCount(tierCount)}</p>}
          {/* Y el incentivo, para quien cobra por tramos. Se dice cuanto falta y
              cuanto pasaria a valer CADA boleta, no cuanto ganaria en total: eso
              ultimo es una proyeccion y no puede parecer dinero suyo (BR-G02). */}
          {nextTier === null ? null : (
            <p>
              {teamCounts
                ? copy.nextTierWithTeam(nextTier.ticketsToNext, nextTier.rate)
                : copy.nextTier(nextTier.ticketsToNext, nextTier.rate)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
