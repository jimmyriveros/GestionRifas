'use client'

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import { BackButton } from '@/components/data/BackButton'
import { tourTarget } from '@/features/tour/tours'
import { cn } from '@/lib/utils'

import { APP_HEADER_HEIGHT_PX, isPageHeaderHidden } from './compact-header'

/**
 * Cabecera contextual (D-150).
 *
 * Una isla cliente: el `PageHeader` avisa cuando sale de la vista y la
 * cabecera fija de `AppShell` muestra titulo, flecha y CTA. El cruce lo decide
 * IntersectionObserver —un setState por umbral, no por pixel de scroll—.
 *
 * Fuera de `AppShell` (p. ej. «Cambiar contraseña») no hay proveedor: el
 * encabezado se pinta igual que siempre y no se observa nada.
 */

export type CompactHeaderEntry = {
  title: string
  backHref?: string
  backLabel?: string
}

type CompactHeaderApi = {
  setEntry: (entry: CompactHeaderEntry | null) => void
  setCompact: (value: boolean) => void
}

type CompactHeaderView = {
  entry: CompactHeaderEntry | null
  compact: boolean
  actionTarget: HTMLElement | null
  setActionTarget: (node: HTMLElement | null) => void
}

const ApiContext = createContext<CompactHeaderApi | null>(null)
const ViewContext = createContext<CompactHeaderView | null>(null)

export function CompactHeaderProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<CompactHeaderEntry | null>(null)
  const [compact, setCompact] = useState(false)
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null)

  const api = useMemo<CompactHeaderApi>(() => ({ setEntry, setCompact }), [])
  const view = useMemo<CompactHeaderView>(
    () => ({ entry, compact, actionTarget, setActionTarget }),
    [entry, compact, actionTarget],
  )

  return (
    <ApiContext.Provider value={api}>
      <ViewContext.Provider value={view}>{children}</ViewContext.Provider>
    </ApiContext.Provider>
  )
}

function useCompactApi() {
  return useContext(ApiContext)
}

function useCompactView() {
  return useContext(ViewContext)
}

/**
 * Observa el bloque entero de `PageHeader` y publica titulo / flecha.
 *
 * Conserva `data-tour="page-header"` en el encabezado original: el recorrido
 * guiado no debe encontrar un segundo objetivo en la cabecera compacta.
 */
export function PageHeaderSentinel({
  title,
  backHref,
  backLabel,
  className,
  children,
}: {
  title: string
  backHref?: string
  backLabel?: string
  className?: string
  children: ReactNode
}) {
  const api = useCompactApi()
  const ref = useRef<HTMLDivElement>(null)
  const compactRef = useRef(false)

  useLayoutEffect(() => {
    if (!api) return
    const el = ref.current
    api.setEntry({ title, backHref, backLabel })
    compactRef.current = false
    api.setCompact(false)
    if (!el) return

    const sticky = document.querySelector('[data-app-header]')
    const stickyHeight = sticky?.getBoundingClientRect().height ?? APP_HEADER_HEIGHT_PX

    const apply = (hidden: boolean) => {
      if (hidden === compactRef.current) return
      compactRef.current = hidden
      api.setCompact(hidden)
    }

    apply(isPageHeaderHidden(el.getBoundingClientRect().bottom, stickyHeight))

    const observer = new IntersectionObserver(
      (entries) => {
        const obs = entries[0]
        if (!obs) return
        apply(isPageHeaderHidden(obs.boundingClientRect.bottom, stickyHeight))
      },
      {
        root: null,
        rootMargin: `-${stickyHeight}px 0px 0px 0px`,
        threshold: [0, 1],
      },
    )
    observer.observe(el)

    return () => {
      observer.disconnect()
      compactRef.current = false
      api.setEntry(null)
      api.setCompact(false)
    }
  }, [api, title, backHref, backLabel])

  return (
    <div ref={ref} className={className} {...tourTarget('page-header')}>
      {children}
    </div>
  )
}

/**
 * Desmonta la flecha original cuando la compacta esta activa, para no dejar
 * dos botones «Volver» en el orden de tabulacion. El hueco se conserva para
 * no mover el titulo (D-126) aunque el encabezado ya este fuera de la vista.
 */
export function PageHeaderBack({ children }: { children: ReactNode }) {
  const view = useCompactView()
  const compact = Boolean(view?.compact && view.entry)
  if (compact) {
    return <div className="-my-1.5 -ms-3 size-11 shrink-0" aria-hidden />
  }
  return <div className="-my-1.5 -ms-3 shrink-0">{children}</div>
}

const COMPACT_ACTION_CLASS = [
  'flex items-center',
  '[&_[data-slot=button]]:h-11 [&_[data-slot=button]]:w-auto [&_[data-slot=button]]:min-w-11 [&_[data-slot=button]]:grow-0',
  'max-md:[&_[data-slot=button]]:size-11 max-md:[&_[data-slot=button]]:p-0 max-md:[&_[data-slot=button]]:gap-0',
  'max-md:[&_[data-slot=button]]:text-[0px] max-md:[&_[data-slot=button]_svg]:size-5',
  'md:[&_[data-slot=button]]:h-9',
].join(' ')

/**
 * Contrato semantico del CTA que puede subir a la cabecera.
 *
 * La misma instancia se mueve con un portal: no hay dos copias del boton, ni
 * dos dialogos, ni dos destinos de teclado. Quien lo usa lo marca; no se
 * adivina por la variante CSS.
 */
export function CompactActionSlot({ children }: { children: ReactNode }) {
  const view = useCompactView()
  const compact = Boolean(view?.compact && view.entry)
  const target = view?.actionTarget ?? null

  if (compact && target) {
    return createPortal(
      <div data-compact-action className={COMPACT_ACTION_CLASS}>
        {children}
      </div>,
      target,
    )
  }

  return children
}

/** Hueco a la izquierda de la cabecera: organizacion, o titulo compacto. */
export function CompactHeaderStart({ orgName }: { orgName: string }) {
  const view = useCompactView()
  const entry = view?.entry ?? null
  const show = Boolean(view?.compact && entry)

  return (
    <div
      data-compact-header={show ? 'active' : 'idle'}
      className="relative flex min-w-0 flex-1 items-center"
    >
      <span
        className={cn(
          'truncate font-semibold transition-opacity duration-150 motion-reduce:transition-none md:hidden',
          show ? 'opacity-0' : 'opacity-100',
        )}
        aria-hidden={show}
      >
        {orgName}
      </span>

      <div
        className={cn(
          'flex min-w-0 items-center gap-0.5 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none',
          'max-md:absolute max-md:inset-y-0 max-md:start-0 max-md:end-0',
          show ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-0.5 opacity-0',
        )}
        inert={show ? undefined : true}
      >
        {show && entry?.backHref ? (
          <BackButton fallbackHref={entry.backHref} label={entry.backLabel} className="-ms-2" />
        ) : null}
        <span
          data-compact-title
          className="min-w-0 truncate font-semibold"
          title={entry?.title}
          aria-hidden
        >
          {entry?.title}
        </span>
      </div>
    </div>
  )
}

/** Destino del portal del CTA, entre la campana y el menu de usuario. */
export function CompactHeaderActionTarget() {
  const view = useCompactView()
  const setActionTarget = view?.setActionTarget
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      setActionTarget?.(node)
    },
    [setActionTarget],
  )

  return <div ref={ref} className="flex items-center empty:hidden" />
}
