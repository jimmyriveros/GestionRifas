/**
 * Los iconos de las tarjetas de la imagen, tomados de lucide (BR-H04, D-194).
 *
 * Satori no puede pintar los componentes de `lucide-react`: son `forwardRef` y
 * leen un contexto de React, y Satori solo recorre elementos. Lo que sí pinta es
 * un `<svg>` normal, así que se usan los MISMOS trazos que exporta cada icono
 * (`__iconNode`) —la geometría de lucide, sin redibujar nada— y la composición
 * los envuelve en su `<svg>`. Los tipos de esos módulos están en
 * `src/types/lucide-icon-nodes.d.ts`.
 *
 * SOLO LO VARIABLE. Vehículo, monedas, regalo, tickets y confeti son del fondo y
 * no se dibujan aquí con ningún icono.
 */

import { __iconNode as building2 } from 'lucide-react/dist/esm/icons/building-2.mjs'
import { __iconNode as calendarDays } from 'lucide-react/dist/esm/icons/calendar-days.mjs'
import { __iconNode as church } from 'lucide-react/dist/esm/icons/church.mjs'
import { __iconNode as flower } from 'lucide-react/dist/esm/icons/flower.mjs'
import { __iconNode as plus } from 'lucide-react/dist/esm/icons/plus.mjs'
import { __iconNode as trees } from 'lucide-react/dist/esm/icons/trees.mjs'
import { __iconNode as trophy } from 'lucide-react/dist/esm/icons/trophy.mjs'

import type { LotteryCode } from '@/features/lottery/constants'

/** Los elementos SVG de un icono: `[etiqueta, atributos]`. */
export type LucideIconNode = readonly (readonly [string, Readonly<Record<string, string>>])[]

/** Un icono por lotería, en el orden de la semana. Boyacá lleva el trofeo del número semanal. */
export const WEEKLY_RESULTS_LOTTERY_ICONS = {
  cundinamarca: building2,
  cruz_roja: plus,
  meta: trees,
  bogota: church,
  medellin: flower,
  boyaca: trophy,
} as const satisfies Record<LotteryCode, LucideIconNode>

/** El calendario de la cápsula de la semana. */
export const WEEKLY_RESULTS_CALENDAR_ICON: LucideIconNode = calendarDays
