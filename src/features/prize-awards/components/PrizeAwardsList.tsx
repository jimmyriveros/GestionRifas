import { TriangleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { RowLink } from '@/components/data/RowLink'
import { Notice } from '@/components/feedback/Notice'
import { ReportTable, type ReportTableColumn } from '@/features/reports/components/ReportTable'
import {
  TICKET_NUMBERS_LEGEND,
  TicketNumbersCell,
  TicketNumbersLink,
  hasBothNumbers,
} from '@/features/tickets/components/TicketNumbers'
import { formatDateEs } from '@/lib/dates'
import { cn } from '@/lib/utils'

import {
  PRIZE_AWARDS_COPY as COPY,
  prizeAwardDrawText,
  prizeAwardPlayedText,
  prizeAwardRewardText,
  prizeAwardValue,
} from '../copy'
import type { AdminPrizeAward, PrizeAwardBase, SellerPrizeAward } from '../queries'

/**
 * El historial de premios: UNA consulta, DOS presentaciones (el patrón de
 * `TicketsList`, D-107). En el teléfono y la tableta, tarjetas; desde `lg`, la
 * tabla. Lo elige Tailwind, no JavaScript, y las dos reciben las mismas filas,
 * ya filtradas, ordenadas y paginadas en PostgreSQL.
 *
 * DOS PÚBLICOS, DOS CONTRATOS. El vendedor pasa `SellerPrizeAward`, con su
 * cliente; el personal, `AdminPrizeAward`, que no declara ninguno y trae al
 * vendedor. Lo único que cambia es esa columna: el sorteo, la boleta, el premio
 * y el valor se pintan con las mismas piezas.
 *
 * NADA SE ESCONDE EN EL TELÉFONO. La tabla reparte a lo ancho lo que la tarjeta
 * reparte a lo alto: fecha del sorteo, lotería y sorteo, número mayor, la
 * persona, la boleta con sus ceros, el número que jugó, el premio, su valor y
 * lo que requiere verificación. Nada de eso es secundario.
 *
 * ES UN SERVER COMPONENT: no hay orden en el navegador —sería el de la página
 * visible (D-058)— ni estado. Los enlaces van sin precarga (`RowLink`, D-104).
 */

type SellerProps = {
  audience: 'seller'
  awards: SellerPrizeAward[]
  ticketBasePath: string
  clientBasePath: string
}

type StaffProps = {
  audience: 'staff'
  awards: AdminPrizeAward[]
  ticketBasePath: string
  sellerBasePath: string
  /**
   * Los vendedores con ficha: un premio de alguien que ya no vende —pasó a
   * Administrador— conserva su nombre, pero su ficha de vendedor no existe y el
   * enlace llevaría a «no encontrado».
   */
  linkableSellerIds: readonly string[]
}

export type PrizeAwardsListProps = SellerProps | StaffProps

type Row = PrizeAwardBase & { person: ReactNode }

function personOf(props: PrizeAwardsListProps): Row[] {
  if (props.audience === 'seller') {
    return props.awards.map((award) => ({
      ...award,
      person: award.clientId ? (
        <RowLink
          href={`${props.clientBasePath}/${award.clientId}`}
          className="font-medium break-words hover:underline"
        >
          {award.clientName ?? COPY.row.unnamedClient}
        </RowLink>
      ) : (
        <span className="text-muted-foreground">{COPY.row.unnamedClient}</span>
      ),
    }))
  }

  const linkable = new Set(props.linkableSellerIds)
  return props.awards.map((award) => {
    const name = award.sellerName ?? COPY.row.unnamedSeller
    return {
      ...award,
      person: linkable.has(award.sellerId) ? (
        <RowLink
          href={`${props.sellerBasePath}/${award.sellerId}`}
          className="font-medium break-words hover:underline"
        >
          {name}
        </RowLink>
      ) : (
        <span className="font-medium break-words">{name}</span>
      ),
    }
  })
}

export function PrizeAwardsList(props: PrizeAwardsListProps) {
  const rows = personOf(props)
  const personHeader = props.audience === 'seller' ? COPY.columns.client : COPY.columns.seller
  const personLabel = props.audience === 'seller' ? COPY.row.client : COPY.row.seller

  return (
    <div data-slot="prize-awards-list">
      {/* La tabla necesita sus seis columnas enteras, y eso son unos 1.100 px:
          por debajo de `xl` —una tableta, o un portátil con la barra lateral
          abierta— van las tarjetas, en dos columnas desde `md`. */}
      <ul className="grid gap-3 md:grid-cols-2 xl:hidden" aria-label={COPY.caption[props.audience]}>
        {rows.map((row) => (
          <PrizeAwardCard
            key={row.key}
            row={row}
            personLabel={personLabel}
            ticketBasePath={props.ticketBasePath}
          />
        ))}
      </ul>
      <div className="hidden xl:block">
        <ReportTable
          caption={COPY.caption[props.audience]}
          rows={rows}
          getRowId={(row) => row.key}
          columns={tableColumns(personHeader, props.ticketBasePath)}
        />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Lo que requiere verificación
// -----------------------------------------------------------------------------

/**
 * Un resultado que entró en conflicto, o un número de boleta que ya no es el
 * que jugó: el premio NO desaparece ni cambia su valor (BR-J18); se dice aquí,
 * con palabras. El color acompaña al texto, nunca lo sustituye (§27).
 */
function ReviewNotice({ children }: { children: ReactNode }) {
  return (
    <Notice tone="warning" density="compact" icon={<TriangleAlertIcon />}>
      {children}
    </Notice>
  )
}

// -----------------------------------------------------------------------------
// La tarjeta del teléfono
// -----------------------------------------------------------------------------

function PrizeAwardCard({
  row,
  personLabel,
  ticketBasePath,
}: {
  row: Row
  personLabel: string
  ticketBasePath: string
}) {
  const value = prizeAwardValue(row)
  const reward = prizeAwardRewardText(row)

  return (
    <li
      data-slot="prize-award-card"
      className="bg-card text-card-foreground min-w-0 space-y-3 rounded-lg border p-4"
    >
      {/* Qué se ganó y después cuánto vale: el premio, lo que entrega y su
          valor, en el orden en que se cuenta. */}
      <div className="min-w-0 space-y-1">
        <p className="text-heading-h4 break-words">{row.prizeTitle}</p>
        {reward ? <p className="text-sm break-words">{reward}</p> : null}
        <p
          className={cn(
            'text-lg font-semibold [overflow-wrap:anywhere] tabular-nums',
            value.pending && 'text-status-warning-text',
          )}
        >
          {value.main}
        </p>
        {value.detail ? (
          <p className="text-muted-foreground text-sm break-words">{value.detail}</p>
        ) : null}
        {row.origin === 'declared' ? (
          <p className="text-muted-foreground text-xs">{COPY.row.declared}</p>
        ) : null}
      </div>

      {/* Dos columnas de verdad: el rótulo a la izquierda y el dato a la
          derecha, con la columna del dato encogible para que un nombre largo
          baje de línea en vez de salirse (D-125). */}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">{COPY.row.drawDate}</dt>
        <dd className="font-medium">{formatDateEs(row.referenceDate)}</dd>

        <dt className="text-muted-foreground">{COPY.row.draw}</dt>
        <dd className="break-words">{prizeAwardDrawText(row)}</dd>

        <dt className="text-muted-foreground">{COPY.row.winningNumber}</dt>
        <dd className="font-mono font-medium tabular-nums">{row.winningNumber ?? '—'}</dd>

        <dt className="text-muted-foreground">{personLabel}</dt>
        <dd className="min-w-0">{row.person}</dd>

        <dt className="text-muted-foreground">{COPY.row.ticket}</dt>
        <dd className="min-w-0">
          <TicketNumbersLink ticket={row} href={`${ticketBasePath}/${row.ticketId}`} />
          {hasBothNumbers(row) ? (
            <span className="text-muted-foreground block text-xs">{TICKET_NUMBERS_LEGEND}</span>
          ) : null}
        </dd>

        <dt className="text-muted-foreground">{COPY.row.playedWith}</dt>
        <dd className="break-words">{prizeAwardPlayedText(row)}</dd>

        <dt className="text-muted-foreground">{COPY.row.raffle}</dt>
        <dd className="break-words">{row.raffleName}</dd>
      </dl>

      {row.resultConflict ? <ReviewNotice>{COPY.row.conflict}</ReviewNotice> : null}
      {row.numbersChanged ? <ReviewNotice>{COPY.row.numbersChanged}</ReviewNotice> : null}
    </li>
  )
}

// -----------------------------------------------------------------------------
// La tabla de escritorio
// -----------------------------------------------------------------------------

/**
 * Las columnas de la tabla. La celda base de la tabla no deja partir líneas
 * (`whitespace-nowrap`, pensado para cifras cortas); aquí cada celda lleva
 * nombres, premios y avisos, así que todas vuelven a `whitespace-normal`: un
 * nombre largo baja de línea en vez de montarse sobre la columna siguiente.
 */
function tableColumns(personHeader: string, ticketBasePath: string): ReportTableColumn<Row>[] {
  return [
    {
      header: COPY.columns.drawDate,
      cell: (row) => (
        <span className="font-medium whitespace-nowrap">{formatDateEs(row.referenceDate)}</span>
      ),
    },
    {
      header: COPY.columns.draw,
      cell: (row) => (
        <div className="max-w-56 min-w-36 space-y-1 whitespace-normal">
          <p className="break-words">{prizeAwardDrawText(row)}</p>
          <p>
            <span className="text-muted-foreground">{COPY.row.winningNumber} </span>
            <span className="font-mono font-medium tabular-nums">{row.winningNumber ?? '—'}</span>
          </p>
          {row.resultConflict ? <ReviewNotice>{COPY.row.conflict}</ReviewNotice> : null}
        </div>
      ),
    },
    {
      header: personHeader,
      cell: (row) => <div className="max-w-48 min-w-28 whitespace-normal">{row.person}</div>,
    },
    {
      header: COPY.columns.ticket,
      cell: (row) => (
        <div className="max-w-60 min-w-40 space-y-1 whitespace-normal">
          <TicketNumbersCell ticket={row} href={`${ticketBasePath}/${row.ticketId}`} />
          <p className="text-sm">
            <span className="text-muted-foreground">{COPY.row.playedWith} </span>
            {prizeAwardPlayedText(row, { inSentence: true })}
          </p>
          {row.numbersChanged ? <ReviewNotice>{COPY.row.numbersChanged}</ReviewNotice> : null}
        </div>
      ),
    },
    {
      header: COPY.columns.prize,
      cell: (row) => {
        const reward = prizeAwardRewardText(row)
        return (
          <div className="max-w-64 min-w-40 space-y-0.5 whitespace-normal">
            <p className="font-medium break-words">{row.prizeTitle}</p>
            {reward ? <p className="text-sm break-words">{reward}</p> : null}
            <p className="text-muted-foreground text-xs break-words">{row.raffleName}</p>
            {row.origin === 'declared' ? (
              <p className="text-muted-foreground text-xs">{COPY.row.declared}</p>
            ) : null}
          </div>
        )
      },
    },
    {
      header: COPY.columns.value,
      align: 'right',
      cell: (row) => {
        const value = prizeAwardValue(row)
        return (
          <div className="ml-auto max-w-44 min-w-28 space-y-0.5 whitespace-normal">
            <p
              className={cn(
                'font-semibold [overflow-wrap:anywhere] tabular-nums',
                value.pending && 'text-status-warning-text',
              )}
            >
              {value.main}
            </p>
            {value.detail ? <p className="text-muted-foreground text-xs">{value.detail}</p> : null}
          </div>
        )
      },
    },
  ]
}
