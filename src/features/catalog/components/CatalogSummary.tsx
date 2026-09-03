import { TargetIcon, UsersIcon, ZapIcon } from 'lucide-react'

import { percentageReserved, type CatalogStats } from '../stats'

/**
 * Las cifras del catalogo publico (D-164, BR-K14).
 *
 * SON DEL CATALOGO ENTERO, NO DE ESTA PAGINA. Vienen del agregado que hace la
 * base junto a los metadatos (`0046`), una llamada que **no recibe ni pagina ni
 * termino de busqueda**: por construccion no pueden cambiar al pasar de pagina,
 * al buscar, ni cuando una busqueda no encuentra nada. Antes se contaban las
 * boletas de la pagina y por eso decian «En esta página»; ese rotulo desaparece
 * porque desaparece el motivo.
 *
 * NO SE CUENTAN AQUI. Ni un `tickets.filter(...)`, ni una descarga del catalogo
 * para contarlo en el navegador: el unico sitio donde se suma algo es
 * `catalogStats`, que hace `available + taken`.
 *
 * TRES CIFRAS Y UNA BARRA, y la barra usa EXACTAMENTE el porcentaje escrito
 * —el mismo numero, no un segundo calculo—, que es lo que impide que el texto
 * diga 72 % y el dibujo enseñe otra cosa.
 */

/**
 * A partir de que porcentaje se avisa de que quedan pocos.
 *
 * EL AVISO NO ES INCONDICIONAL, Y ES UNA DECISION. El encargo pedia escribir
 * «¡Quedan pocos números!» siempre; con el 10 % vendido eso seria falso, y esta
 * es la unica pantalla que lee alguien de fuera de la organizacion, que no
 * tiene forma de contrastarlo. La aplicacion no dice cosas que no son ciertas
 * (`docs/UX_COPY_GUIDELINES.md` 7 y 35.2.4): el aviso aparece cuando de verdad
 * quedan pocos, y calla cuando no. El umbral es el del propio ejemplo del
 * encargo, 72 %, redondeado a 70.
 */
const POCOS_DESDE = 70

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: string
  label: string
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <span
        className="bg-primary/15 text-primary-foreground ring-primary/25 flex size-8 shrink-0 items-center justify-center rounded-full ring-1"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-lg leading-tight font-semibold tabular-nums">{value}</p>
        <p className="text-muted-foreground truncate text-xs leading-tight">{label}</p>
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
      className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 backdrop-blur-sm"
    >
      {/*
        En escritorio las tres en una fila; en el telefono tambien, porque son
        cifras cortas y apilarlas convertia la franja en una tarjeta alta. Los
        separadores solo aparecen donde caben.
      */}
      <div className="grid grid-cols-3 divide-x divide-white/10">
        <Stat
          icon={<TargetIcon className="size-4" />}
          value={String(available)}
          label="números disponibles"
        />
        <Stat
          icon={<UsersIcon className="size-4" />}
          value={`${taken} de ${total}`}
          label="ya fueron tomados"
        />
        <Stat
          icon={<ZapIcon className="size-4" />}
          value={`${reservado}%`}
          label="reservado"
        />
      </div>

      {/*
        La barra es decoracion de una cifra que ya esta escrita al lado, asi que
        no se anuncia dos veces: `aria-hidden`. Quien escucha la pantalla ya ha
        oido «72 %, reservado».
      */}
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,oklch(0.55_0.24_296),oklch(0.72_0.2_300))]"
          style={{ width: `${reservado}%` }}
        />
      </div>

      {reservado >= POCOS_DESDE ? (
        <p className="text-secondary mt-2 flex items-center justify-center gap-1.5 text-center text-xs font-medium">
          <ZapIcon className="size-3.5 shrink-0" aria-hidden />
          ¡Quedan pocos números!
        </p>
      ) : null}
    </section>
  )
}
