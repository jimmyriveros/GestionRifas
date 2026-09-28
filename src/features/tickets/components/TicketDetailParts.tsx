import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateEs, formatTimeEs } from '@/lib/dates'
import { cn } from '@/lib/utils'

/**
 * Las piezas de presentacion que comparten los DOS detalles de boleta: el del
 * vendedor (D-231) y el administrativo (D-234).
 *
 * Nacieron en la pagina del vendedor y se sacaron aqui, sin cambiar ni una
 * clase, cuando el detalle administrativo adopto la misma composicion. Asi los
 * dos portales pintan igual lo que muestran igual —los numeros, las tarjetas
 * con titulo, las lineas de «Detalles»— y cada pagina sigue decidiendo QUE
 * tarjetas lleva y donde. Ninguna pieza lee datos ni sabe de clientes, precios
 * o abonos: lo que el personal no puede ver (D-198) no pasa por aqui.
 */

/**
 * La densidad de las tarjetas del detalle (D-231): menos aire que el `Card` de
 * siempre entre el titulo y el contenido, la misma que ya usa
 * `SellerCatalogCard`. Es de estas pantallas, no del primitivo: por eso se
 * exporta, para las tarjetas que son componentes propios (`TicketPaymentSummary`,
 * `TicketPaymentsCard`).
 */
export const TICKET_DETAIL_CARD = 'gap-4 py-4 md:py-5'

/**
 * El titulo de una tarjeta del detalle.
 *
 * UN ENCABEZADO DE VERDAD: bajo el `h1` de la pantalla, cada tarjeta es una
 * seccion, y un lector de pantalla salta entre ellas por sus `h2`. El rol
 * tipografico es `Heading/H4` —16 px, seminegrita—, el de Figma.
 */
export function TicketDetailSectionHeader({ title }: { title: string }) {
  return (
    <CardHeader>
      <CardTitle className="text-heading-h4">
        <h2>{title}</h2>
      </CardTitle>
    </CardHeader>
  )
}

/** Una tarjeta del detalle: su densidad, su titulo y lo que lleve dentro. */
export function TicketDetailCard({
  title,
  className,
  children,
}: {
  title: string
  /** La colocacion la decide la pagina (`md:col-span-2`); la tarjeta no la impone. */
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn(TICKET_DETAIL_CARD, className)}>
      <TicketDetailSectionHeader title={title} />
      {children}
    </Card>
  )
}

/**
 * Los dos tonos del acento indigo, uno por numero (D-233): el diario, intenso;
 * el semanal, suave. Solo ROLES del sistema —ni hexadecimales ni primitivas—, y
 * cada tono trae los tres: fondo, texto y borde.
 */
const TICKET_NUMBER_TONES = {
  daily:
    'bg-accent-indigo-surface-strong text-accent-indigo-foreground border-accent-indigo-border-strong',
  weekly:
    'bg-accent-indigo-surface text-accent-indigo-foreground-subtle border-accent-indigo-border',
} as const

/**
 * «Números de la boleta»: la misma tarjeta en los dos portales (D-231, D-234).
 *
 * Un numero que falta —una boleta en borrador— se pinta con una raya, y quien
 * escucha la pantalla oye «Sin número» en lugar de un signo que no se lee.
 */
export function TicketNumbersCard({
  dailyNumber,
  weeklyNumber,
  className,
}: {
  dailyNumber: string | null
  weeklyNumber: string | null
  className?: string
}) {
  return (
    <TicketDetailCard title="Números de la boleta" className={className}>
      <CardContent className="grid grid-cols-2 gap-3">
        <TicketNumber label="Número diario" value={dailyNumber} tone="daily" />
        <TicketNumber label="Número semanal" value={weeklyNumber} tone="weekly" />
      </CardContent>
    </TicketDetailCard>
  )
}

/**
 * Uno de los dos numeros, con su nombre encima: cual es cual importa.
 *
 * Con el ACENTO INDIGO de Color v2 (D-230), que es un realce y no un estado.
 * Cada numero lleva su tono, como en Figma: el diario, un punto mas intenso
 * (D-233). Es una decision VISUAL. BR-N11 pide nombrar la boleta por sus dos
 * numeros y no dice nada de su color: lo que dice cual es cual es el rotulo,
 * no el tono (CLAUDE.md §27). Los dos textos pasan 4,5:1 en claro y en oscuro.
 *
 * La cifra usa Geist con `tabular-nums`, no `font-mono`: esa pila es la
 * monoespaciada DEL SISTEMA (I-070), distinta en cada telefono.
 *
 * LAS DOS CIFRAS VAN A LA MISMA ALTURA aunque un rotulo ocupe dos lineas. A
 * 320 px «Número semanal» no cabe en una, y con la cifra pegada al rotulo el
 * semanal quedaba 17 px mas abajo que el diario. Las dos cajas miden lo mismo
 * —son hijas de la misma rejilla—, asi que basta con llevar la cifra al pie.
 */
function TicketNumber({
  label,
  value,
  tone,
}: {
  label: string
  value: string | null
  tone: keyof typeof TICKET_NUMBER_TONES
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col justify-between gap-1 rounded-lg border px-3 py-2.5',
        TICKET_NUMBER_TONES[tone],
      )}
    >
      {/* Sin recortar: en una columna estrecha el rotulo baja de linea, pero
          «cuál de los dos números es este» no se puede esconder. */}
      <p className="text-xs font-medium">{label}</p>
      <p className="text-metric-x-large tabular-nums">
        {value ?? (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">Sin número</span>
          </>
        )}
      </p>
    </div>
  )
}

/**
 * Una fila de «Detalles de la boleta»: el rotulo en una columna fija y el valor
 * a su lado, alineado a la izquierda como en Figma. El valor PARTE su texto
 * (`break-words`) en vez de empujar la columna: una fecha con el nombre del
 * cliente detras no cabe en 120 px.
 *
 * `long` es para un texto de varias frases —el motivo de una anulacion—: en el
 * telefono el rotulo va encima y el texto ocupa el ancho entero de la tarjeta.
 * En una columna de 112 px, trescientos caracteres serian veinte lineas.
 */
export function DetailLine({
  label,
  value,
  mono = false,
  long = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
  long?: boolean
}) {
  return (
    <div
      className={cn(
        'grid gap-x-4 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]',
        long ? 'grid-cols-1 gap-y-1' : 'grid-cols-[minmax(0,7rem)_minmax(0,1fr)]',
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'text-muted-foreground font-mono break-words' : 'break-words'}>
        {value}
      </dd>
    </div>
  )
}

/**
 * Fecha y hora, con la hora ENTERA: se queda en la línea o baja completa, nunca
 * partida entre «a.» y «m.», que se lee como una errata (misma regla que el
 * recuadro de loterías, D-181). El texto es exactamente el de
 * `formatDateTimeEs`, que une las dos piezas con «, ».
 */
export function DateTime({ value }: { value: string }) {
  return (
    <>
      {`${formatDateEs(value)}, `}
      <span className="whitespace-nowrap">{formatTimeEs(value)}</span>
    </>
  )
}

/**
 * La nota que va debajo de «Detalles»: que es el codigo interno y por que no
 * sirve para buscar (BR-N11). Fuera de la lista y con su propio margen: en
 * Figma se montaba sobre la fila del codigo.
 */
export function InternalCodeNote() {
  return (
    <p className="text-muted-foreground mt-4 text-xs">
      El código interno lo genera el sistema para identificar la boleta por dentro. Para buscarla,
      usa sus números.
    </p>
  )
}
