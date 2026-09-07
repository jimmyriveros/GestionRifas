import { TargetIcon, UsersIcon, ZapIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { percentageReserved, type CatalogStats } from '../stats'

/**
 * Las cifras del catalogo publico (D-164, BR-K14; reorganizado en D-165).
 *
 * SON DEL CATALOGO ENTERO, NO DE ESTA PAGINA. Vienen del agregado que hace la
 * base junto a los metadatos (`0046`), una llamada que **no recibe ni pagina ni
 * termino de busqueda**: por construccion no pueden cambiar al pasar de pagina,
 * al buscar, ni cuando una busqueda no encuentra nada.
 *
 * NO SE CUENTAN AQUI. Ni un `tickets.filter(...)`, ni una descarga del catalogo
 * para contarlo en el navegador: el unico sitio donde se suma algo es
 * `catalogStats`, que hace `available + taken`.
 *
 * UN SOLO MARCADO PARA LOS DOS DISENOS (D-165). En el telefono, «números
 * disponibles» es la metrica principal y ocupa la fila entera; debajo van las
 * dos secundarias, a mitad y mitad. Desde `sm`, las tres en una fila. **No hay
 * dos versiones del componente**: es la misma reja de dos columnas donde la
 * primera celda ocupa las dos, y a partir de `sm` pasa a tres columnas. Escribir
 * dos bloques y ocultar uno habria duplicado las cifras en el HTML y en el arbol
 * de accesibilidad.
 *
 * LAS ETIQUETAS NO SE RECORTAN. Antes eran tres columnas tambien en el telefono
 * y salia «números dis…», «ya fueron to…». Aqui pueden ocupar dos lineas: una
 * cifra sin su nombre completo no dice nada.
 *
 * LA BARRA usa EXACTAMENTE el porcentaje escrito —el mismo numero, no un
 * segundo calculo—, que es lo que impide que el texto diga 72 % y el dibujo
 * enseñe otra cosa.
 */

/**
 * A partir de que porcentaje se avisa de que quedan pocos.
 *
 * EL AVISO NO ES INCONDICIONAL, Y ES UNA DECISION. El encargo pedia escribir
 * «¡Quedan pocos números!» siempre; con el 10 % vendido eso seria falso, y esta
 * es la unica pantalla que lee alguien de fuera de la organizacion, que no
 * tiene forma de contrastarlo. La aplicacion no dice cosas que no son ciertas
 * (`docs/UX_COPY_GUIDELINES.md` 7 y 35.2.4): el aviso aparece cuando de verdad
 * quedan pocos, y calla —sin dejar hueco— cuando no.
 */
const POCOS_DESDE = 70

function Stat({
  icon,
  value,
  label,
  principal = false,
  className,
}: {
  icon: React.ReactNode
  value: string
  label: string
  principal?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'ring-primary/25 flex shrink-0 items-center justify-center rounded-full ring-1',
          principal ? 'bg-secondary/15 text-secondary size-9' : 'bg-primary/15 text-primary-foreground size-8',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p
          data-testid="catalog-stat-value"
          className={cn(
            'leading-tight font-semibold tabular-nums',
            principal ? 'text-secondary text-2xl' : 'text-lg',
          )}
        >
          {value}
        </p>
        {/* Sin `truncate`: caben en dos lineas antes que perder una palabra. */}
        <p className="text-muted-foreground text-xs leading-tight text-pretty">{label}</p>
      </div>
    </div>
  )
}

export function CatalogSummary({ stats }: { stats: CatalogStats }) {
  const { available, taken, total } = stats
  const reservado = percentageReserved({ taken, total })

  return (
    <section
      aria-label="Resumen del catálogo"
      className="border-border-glass bg-surface-glass-subtle mx-auto w-full max-w-3xl rounded-2xl border px-3 py-3 backdrop-blur-sm"
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 sm:gap-y-0">
        <Stat
          icon={<TargetIcon className="size-5" />}
          value={String(available)}
          label="números disponibles"
          principal
          className="col-span-2 sm:col-span-1 sm:pe-3"
        />
        <Stat
          icon={<UsersIcon className="size-4" />}
          value={`${taken} de ${total}`}
          label="ya fueron tomados"
          className="border-border-glass border-t pt-3 sm:border-s sm:border-t-0 sm:ps-3 sm:pt-0"
        />
        <Stat
          icon={<ZapIcon className="size-4" />}
          value={`${reservado}%`}
          label="reservado"
          className="border-border-glass border-s border-t ps-3 pt-3 sm:border-t-0 sm:pt-0"
        />
      </div>

      {/*
        AVANCE DE NEGOCIO, no adorno: su ancho es `tomadas / total`, cero significa
        que no se ha tomado ninguna y cien que se tomaron todas. Por eso lleva los
        roles `progress/*` y no los de marca, que es lo que pintaba antes.

        LO QUE SI ES REDUNDANTE ES EL DIBUJO. La cifra y lo que mide ya estan
        escritas al lado —«43 %, reservado»—, asi que la barra repite algo que ya
        se anuncio: va `aria-hidden` y NO usa `LinearProgress`, que existe para
        anunciar un avance que no esta dicho de otra forma. Adoptarlo aqui
        obligaria a elegir entre anunciar dos veces o debilitar su contrato.

        Si algun dia se quita ese texto, esta barra pasa a ser la unica fuente y
        entonces SI tiene que ser `LinearProgress`.
      */}
      <div className="bg-progress-track mt-3 h-1.5 w-full overflow-hidden rounded-full" aria-hidden>
        <div className="bg-progress-value h-full rounded-full" style={{ width: `${reservado}%` }} />
      </div>

      {/* Cuando calla no reserva sitio: no hay una linea vacia esperando. */}
      {reservado >= POCOS_DESDE ? (
        <p className="text-secondary mt-2 flex items-center justify-center gap-1.5 text-center text-xs font-medium">
          <ZapIcon className="size-3.5 shrink-0" aria-hidden />
          ¡Quedan pocos números!
        </p>
      ) : null}
    </section>
  )
}
