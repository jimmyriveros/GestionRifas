/**
 * El mensaje propio de «Resultados de la semana» (BR-H06, BR-H09, BR-H10, D-197).
 *
 * De lo más puro a lo que se toca: qué mensaje se usa
 * (`activeWeeklyResultsMessage`), qué se deja guardar
 * (`weeklyResultsMessageSchema`), qué devuelve la lectura en cada caso
 * (`getWeeklyResultsMessageSettings`, con la sesión y Supabase sustituidos) y qué
 * hace la pantalla montada de verdad: copiar y compartir con el mensaje activo,
 * encender, apagar, volver al predeterminado y guardar.
 *
 * La base, la RPC, la RLS y la auditoría están en
 * `tests/db/weekly-results-message.test.ts`; el navegador de verdad, en
 * `tests/e2e/resultados-semana*.spec.ts`.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WEEKLY_RESULTS_COPY, weeklyResultsMessage } from '@/features/weekly-results/copy'
import {
  activeWeeklyResultsMessage,
  EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS,
  WEEKLY_RESULTS_MESSAGE_MAX_LENGTH,
  type WeeklyResultsMessageSettings,
  type WeeklyResultsMessageSettingsResult,
} from '@/features/weekly-results/message'
import { weeklyResultsMessageSchema } from '@/features/weekly-results/schemas'
import type { ResultsWeek } from '@/features/weekly-results/week'

vi.mock('@/features/weekly-results/actions', () => ({ saveWeeklyResultsMessage: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getActiveMembership: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/image', () => ({
  // `next/image` necesita la configuración de Next. Aquí solo importa que la
  // imagen esté lista, así que basta un elemento con su dirección.
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}))

const actions = await import('@/features/weekly-results/actions')
const session = await import('@/lib/auth/session')
const supabaseServer = await import('@/lib/supabase/server')
const { getWeeklyResultsMessageSettings } = await import('@/features/weekly-results/queries')
const { WeeklyResultsShare } =
  await import('@/features/weekly-results/components/WeeklyResultsShare')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const AUG: ResultsWeek = { monday: '2026-08-17', saturday: '2026-08-22' }
const SEP: ResultsWeek = { monday: '2026-08-31', saturday: '2026-09-05' }
const COPY = WEEKLY_RESULTS_COPY.share
const PREDETERMINADO = weeklyResultsMessage(AUG)
const EMPTY = EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS

function propio(
  customMessage: string | null,
  useCustomMessage = true,
): WeeklyResultsMessageSettings {
  return { useCustomMessage, customMessage }
}

describe('qué mensaje se usa (activeWeeklyResultsMessage)', () => {
  it('sin personalizar, el predeterminado', () => {
    expect(activeWeeklyResultsMessage(EMPTY, PREDETERMINADO)).toBe(PREDETERMINADO)
  })

  it('el predeterminado sigue siendo el de cada semana', () => {
    const agosto = activeWeeklyResultsMessage(EMPTY, weeklyResultsMessage(AUG))
    const septiembre = activeWeeklyResultsMessage(EMPTY, weeklyResultsMessage(SEP))
    expect(agosto).toContain('del 17 al 22 de agosto de 2026')
    expect(septiembre).toContain('del 31 de agosto al 5 de septiembre de 2026')
    expect(agosto).not.toBe(septiembre)
  })

  it('el propio sustituye al predeterminado entero', () => {
    const activo = activeWeeklyResultsMessage(propio('Hola, grupo.'), PREDETERMINADO)
    expect(activo).toBe('Hola, grupo.')
    expect(activo).not.toContain('Resultados de la semana')
  })

  it('apagar conserva el texto: se usa el predeterminado y, al encender, vuelve el propio', () => {
    expect(activeWeeklyResultsMessage(propio('Lo mío', false), PREDETERMINADO)).toBe(PREDETERMINADO)
    expect(activeWeeklyResultsMessage(propio('Lo mío', true), PREDETERMINADO)).toBe('Lo mío')
  })

  it('volver al predeterminado deja de usar el propio', () => {
    expect(activeWeeklyResultsMessage(propio(null, false), PREDETERMINADO)).toBe(PREDETERMINADO)
  })

  it('datos incoherentes caen al predeterminado, nunca a un mensaje vacío', () => {
    for (const texto of [null, '', '   ', '\n\t  \n']) {
      expect(activeWeeklyResultsMessage(propio(texto), PREDETERMINADO), JSON.stringify(texto)).toBe(
        PREDETERMINADO,
      )
    }
  })

  it('conserva saltos de línea, tildes y emojis, y solo recorta por fuera', () => {
    expect(
      activeWeeklyResultsMessage(propio('  \n¡Hola! 🎉\n\nÑandú, ¿revisaste?  \n'), PREDETERMINADO),
    ).toBe('¡Hola! 🎉\n\nÑandú, ¿revisaste?')
  })

  it('no sustituye nada dentro: no hay marcadores', () => {
    expect(activeWeeklyResultsMessage(propio('Semana {{semana}}'), PREDETERMINADO)).toBe(
      'Semana {{semana}}',
    )
  })
})

describe('qué se deja guardar (weeklyResultsMessageSchema)', () => {
  it('rechaza «usar mi propio mensaje» vacío, con la frase de la pantalla', () => {
    for (const customMessage of ['', '    ', '\n\n']) {
      const result = weeklyResultsMessageSchema.safeParse({ useCustomMessage: true, customMessage })
      expect(result.success, JSON.stringify(customMessage)).toBe(false)
      expect(result.error?.issues[0]?.message).toBe(COPY.messageEmpty)
    }
  })

  it('acepta volver al predeterminado con el texto vacío', () => {
    expect(
      weeklyResultsMessageSchema.parse({ useCustomMessage: false, customMessage: '' }),
    ).toEqual({
      useCustomMessage: false,
      customMessage: '',
    })
  })

  it('rechaza más de 1.000 caracteres y acepta exactamente 1.000', () => {
    const tope = 'a'.repeat(WEEKLY_RESULTS_MESSAGE_MAX_LENGTH)
    expect(
      weeklyResultsMessageSchema.safeParse({ useCustomMessage: true, customMessage: tope }).success,
    ).toBe(true)

    const largo = weeklyResultsMessageSchema.safeParse({
      useCustomMessage: true,
      customMessage: `${tope}a`,
    })
    expect(largo.success).toBe(false)
    expect(largo.error?.issues[0]?.message).toBe(COPY.messageTooLong)
  })

  it('recorta antes de medir: 1.000 caracteres con espacios alrededor caben', () => {
    const tope = 'b'.repeat(1000)
    expect(
      weeklyResultsMessageSchema.parse({ useCustomMessage: true, customMessage: `  ${tope}\n` })
        .customMessage,
    ).toBe(tope)
  })

  it('guarda saltos de línea y Unicode tal cual', () => {
    const texto = '¡Hola! 🎉\n\nÑandú'
    expect(
      weeklyResultsMessageSchema.parse({ useCustomMessage: true, customMessage: texto })
        .customMessage,
    ).toBe(texto)
  })

  it('con emojis mide como JavaScript: más estricta que la base, nunca menos', () => {
    // 🎉 son dos unidades UTF-16 y un solo carácter de PostgreSQL.
    expect(
      weeklyResultsMessageSchema.safeParse({
        useCustomMessage: true,
        customMessage: '🎉'.repeat(501),
      }).success,
    ).toBe(false)
  })

  it('no deja pasar un vendedor, un perfil ni una organización', () => {
    const parsed = weeklyResultsMessageSchema.parse({
      useCustomMessage: true,
      customMessage: 'Hola',
      sellerId: '00000000-0000-4000-8000-000000000001',
      profileId: '00000000-0000-4000-8000-000000000002',
      organizationId: '00000000-0000-4000-8000-000000000003',
    })
    expect(Object.keys(parsed).sort()).toEqual(['customMessage', 'useCustomMessage'])
  })
})

describe('qué devuelve la lectura (getWeeklyResultsMessageSettings)', () => {
  type Respuesta = { data: unknown; error: unknown }

  /** Un cliente de Supabase mínimo que anota los filtros y responde lo que se le pida. */
  function clienteQueResponde(respuesta: Respuesta | (() => never)) {
    const filtros: [string, unknown][] = []
    const consulta = {
      select: vi.fn(() => consulta),
      eq: vi.fn((columna: string, valor: unknown) => {
        filtros.push([columna, valor])
        return consulta
      }),
      maybeSingle: vi.fn(async () => (typeof respuesta === 'function' ? respuesta() : respuesta)),
    }
    return { cliente: { from: vi.fn(() => consulta) }, consulta, filtros }
  }

  const VENDEDOR = {
    organizationId: 'org-1',
    organizationName: 'Rifas',
    role: 'seller' as const,
    profileId: 'perfil-1',
    fullName: 'Vendedor',
    email: 'vendedor@demo.test',
    alias: null,
    activatedAt: null,
  }

  afterEach(() => {
    vi.mocked(session.getActiveMembership).mockReset()
    vi.mocked(supabaseServer.createClient).mockReset()
  })

  it('lee la fila de quien pregunta: su perfil, su organización y su rol de vendedor', async () => {
    vi.mocked(session.getActiveMembership).mockResolvedValue(VENDEDOR)
    const { cliente, consulta, filtros } = clienteQueResponde({
      data: { weekly_results_use_custom_message: true, weekly_results_custom_message: 'Hola' },
      error: null,
    })
    vi.mocked(supabaseServer.createClient).mockResolvedValue(cliente as never)

    expect(await getWeeklyResultsMessageSettings()).toEqual({
      kind: 'ready',
      settings: { useCustomMessage: true, customMessage: 'Hola' },
    })
    expect(cliente.from).toHaveBeenCalledWith('memberships')
    expect(consulta.select).toHaveBeenCalledWith(
      'weekly_results_use_custom_message, weekly_results_custom_message',
    )
    expect(filtros).toEqual([
      ['profile_id', 'perfil-1'],
      ['organization_id', 'org-1'],
      ['role', 'seller'],
    ])
  })

  it('sin fila, o sin ser vendedor, la configuración vacía: el predeterminado', async () => {
    vi.mocked(session.getActiveMembership).mockResolvedValue(VENDEDOR)
    vi.mocked(supabaseServer.createClient).mockResolvedValue(
      clienteQueResponde({ data: null, error: null }).cliente as never,
    )
    expect(await getWeeklyResultsMessageSettings()).toEqual({ kind: 'ready', settings: EMPTY })

    vi.mocked(session.getActiveMembership).mockResolvedValue({ ...VENDEDOR, role: 'owner' })
    expect(await getWeeklyResultsMessageSettings()).toEqual({ kind: 'ready', settings: EMPTY })

    vi.mocked(session.getActiveMembership).mockResolvedValue(null)
    expect(await getWeeklyResultsMessageSettings()).toEqual({ kind: 'ready', settings: EMPTY })
  })

  it('un fallo de la base NO es la configuración vacía: es `error`', async () => {
    vi.mocked(session.getActiveMembership).mockResolvedValue(VENDEDOR)
    vi.mocked(supabaseServer.createClient).mockResolvedValue(
      clienteQueResponde({ data: null, error: { message: 'caída' } }).cliente as never,
    )
    expect(await getWeeklyResultsMessageSettings()).toEqual({ kind: 'error' })
  })

  it('una excepción tampoco tumba la sección', async () => {
    vi.mocked(session.getActiveMembership).mockRejectedValue(new Error('sin red'))
    expect(await getWeeklyResultsMessageSettings()).toEqual({ kind: 'error' })
  })
})

// -----------------------------------------------------------------------------
// La pantalla montada
// -----------------------------------------------------------------------------

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

let container: HTMLDivElement
let root: Root
let share: ReturnType<typeof vi.fn>
let writeText: ReturnType<typeof vi.fn>

/** El navegador de pruebas no trae menú de compartir, portapapeles ni `createObjectURL`. */
function prepararNavegador() {
  share = vi.fn(async () => undefined)
  writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'share', { configurable: true, value: share })
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:vista-previa'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      headers: { get: (name: string) => (name === 'content-type' ? 'image/png' : null) },
      blob: async () => new Blob([PNG], { type: 'image/png' }),
    })),
  )
}

async function esperar() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function montar(
  messageSettings: WeeklyResultsMessageSettingsResult,
  { messageReady = true }: { messageReady?: boolean } = {},
) {
  await act(async () => {
    root.render(
      <WeeklyResultsShare
        imageUrl={messageReady ? '/api/weekly-results/image?week=2026-08-17' : null}
        fileName="resultados-semana-2026-08-17.png"
        imageAlt="Imagen de prueba"
        defaultMessage={PREDETERMINADO}
        messageReady={messageReady}
        messageSettings={messageSettings}
        unavailableText={messageReady ? null : COPY.previewPending}
        groupUrl="https://chat.whatsapp.com/AbCdEf123456"
        copy={COPY}
      />,
    )
  })
  // La imagen llega por promesas: se dejan terminar antes de mirar.
  await esperar()
}

function boton(nombre: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(nombre),
  )
}

function interruptor(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>('[role="switch"]')!
}

function area(): HTMLTextAreaElement {
  return container.querySelector<HTMLTextAreaElement>('textarea')!
}

function vistaPrevia(): string | null {
  return container.querySelector('[data-slot="weekly-results-message"]')?.textContent ?? null
}

async function pulsar(elemento: HTMLElement | undefined) {
  expect(elemento).toBeDefined()
  await act(async () => {
    elemento!.click()
  })
  await esperar()
}

/** Escribe como lo haría una persona: React escucha `input`, no la asignación. */
async function escribir(texto: string) {
  const asignar = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    asignar.call(area(), texto)
    area().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  prepararNavegador()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(actions.saveWeeklyResultsMessage).mockReset()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('copiar y compartir usan el mensaje activo', () => {
  it('copiar usa el mensaje propio y, al apagar, el predeterminado', async () => {
    await montar({ kind: 'ready', settings: propio('Mi mensaje') })

    await pulsar(boton(COPY.copyMessage))
    expect(writeText).toHaveBeenLastCalledWith('Mi mensaje')

    await pulsar(interruptor())
    await pulsar(boton(COPY.copyMessage))
    expect(writeText).toHaveBeenLastCalledWith(PREDETERMINADO)
  })

  it('compartir manda el mensaje propio junto con la imagen', async () => {
    await montar({ kind: 'ready', settings: propio('Mi mensaje') })
    expect(boton(COPY.shareImage)?.disabled).toBe(false)

    await pulsar(boton(COPY.shareImage))
    expect(share).toHaveBeenCalledTimes(1)
    const datos = share.mock.calls[0]![0] as ShareData
    expect(datos.text).toBe('Mi mensaje')
    expect(datos.title).toBe(COPY.shareTitle)
    expect(datos.files).toHaveLength(1)
  })

  it('sin personalizar, compartir manda el predeterminado de la semana', async () => {
    await montar({ kind: 'ready', settings: EMPTY })
    await pulsar(boton(COPY.shareImage))
    expect((share.mock.calls[0]![0] as ShareData).text).toBe(PREDETERMINADO)
  })

  it('lo que se escribe es lo que se ve, se copia y se comparte, recortado', async () => {
    await montar({ kind: 'ready', settings: EMPTY })
    await pulsar(interruptor())
    await escribir('  Texto\n\nnuevo 🍀  ')

    expect(vistaPrevia()).toBe('Texto\n\nnuevo 🍀')
    await pulsar(boton(COPY.copyMessage))
    expect(writeText).toHaveBeenLastCalledWith('Texto\n\nnuevo 🍀')
    await pulsar(boton(COPY.shareImage))
    expect((share.mock.calls.at(-1)![0] as ShareData).text).toBe('Texto\n\nnuevo 🍀')
  })
})

describe('el interruptor y «Volver al mensaje predeterminado»', () => {
  it('encender la primera vez arranca con una copia del predeterminado que se ve', async () => {
    await montar({ kind: 'ready', settings: EMPTY })
    expect(area().readOnly).toBe(true)
    expect(area().value).toBe(PREDETERMINADO)

    await pulsar(interruptor())
    expect(interruptor().getAttribute('aria-checked')).toBe('true')
    expect(area().readOnly).toBe(false)
    expect(area().value).toBe(PREDETERMINADO)
    expect(container.textContent).toContain(COPY.messageCustomHint)
  })

  it('apagar no borra lo escrito: encender otra vez lo devuelve', async () => {
    await montar({ kind: 'ready', settings: EMPTY })
    await pulsar(interruptor())
    await escribir('Lo mío')

    await pulsar(interruptor())
    expect(area().value).toBe(PREDETERMINADO)
    expect(vistaPrevia()).toBe(PREDETERMINADO)

    await pulsar(interruptor())
    expect(area().value).toBe('Lo mío')
    expect(vistaPrevia()).toBe('Lo mío')
  })

  it('volver al predeterminado apaga y vacía: encender arranca otra vez del predeterminado', async () => {
    await montar({ kind: 'ready', settings: propio('Viejo') })

    await pulsar(boton(COPY.messageRestore))
    expect(interruptor().getAttribute('aria-checked')).toBe('false')
    expect(vistaPrevia()).toBe(PREDETERMINADO)
    expect(boton(COPY.messageRestore)).toBeUndefined()

    await pulsar(interruptor())
    expect(area().value).toBe(PREDETERMINADO)
  })
})

describe('guardar', () => {
  it('no manda un mensaje propio vacío: lo dice junto al campo', async () => {
    await montar({ kind: 'ready', settings: EMPTY })
    await pulsar(interruptor())
    await escribir('   ')
    await pulsar(boton(COPY.messageSave))

    expect(actions.saveWeeklyResultsMessage).not.toHaveBeenCalled()
    const alerta = container.querySelector('[role="alert"]')
    expect(alerta?.textContent).toBe(COPY.messageEmpty)
    expect(area().getAttribute('aria-invalid')).toBe('true')
    expect(area().getAttribute('aria-describedby')).toContain(alerta!.id)
  })

  it('guarda lo que se ve y se queda con lo que devolvió el servidor', async () => {
    vi.mocked(actions.saveWeeklyResultsMessage).mockResolvedValue({
      ok: true,
      data: { useCustomMessage: true, customMessage: 'Recortado' },
    })
    await montar({ kind: 'ready', settings: EMPTY })
    await pulsar(interruptor())
    await escribir('  Recortado  ')
    await pulsar(boton(COPY.messageSave))

    expect(actions.saveWeeklyResultsMessage).toHaveBeenCalledWith({
      useCustomMessage: true,
      customMessage: '  Recortado  ',
    })
    expect(area().value).toBe('Recortado')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('un error del servidor se enseña tal cual y no se da por guardado', async () => {
    vi.mocked(actions.saveWeeklyResultsMessage).mockResolvedValue({
      error: 'El mensaje no puede superar 1.000 caracteres.',
    })
    await montar({ kind: 'ready', settings: propio('Algo') })
    await pulsar(boton(COPY.messageSave))

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'El mensaje no puede superar 1.000 caracteres.',
    )
    expect(area().value).toBe('Algo')
  })

  it('sin respuesta del servidor lo dice y conserva lo escrito', async () => {
    vi.mocked(actions.saveWeeklyResultsMessage).mockRejectedValue(new Error('sin red'))
    await montar({ kind: 'ready', settings: propio('Algo') })
    await pulsar(boton(COPY.messageSave))

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(COPY.messageSaveFailed)
    expect(area().value).toBe('Algo')
  })

  it('apagar y guardar manda el texto conservado; volver al predeterminado lo manda vacío', async () => {
    vi.mocked(actions.saveWeeklyResultsMessage).mockImplementation(async (input) => {
      const values = input as { useCustomMessage: boolean; customMessage: string }
      const texto = values.customMessage.trim()
      return {
        ok: true,
        data: {
          useCustomMessage: values.useCustomMessage,
          customMessage: texto === '' ? null : texto,
        },
      }
    })
    await montar({ kind: 'ready', settings: propio('Guardado') })

    await pulsar(interruptor())
    await pulsar(boton(COPY.messageSave))
    expect(actions.saveWeeklyResultsMessage).toHaveBeenLastCalledWith({
      useCustomMessage: false,
      customMessage: 'Guardado',
    })

    await pulsar(interruptor())
    await pulsar(boton(COPY.messageRestore))
    await pulsar(boton(COPY.messageSave))
    expect(actions.saveWeeklyResultsMessage).toHaveBeenLastCalledWith({
      useCustomMessage: false,
      customMessage: '',
    })
  })
})

describe('mientras falten resultados', () => {
  it('el mensaje se prepara y se guarda, pero no se copia ni se comparte', async () => {
    vi.mocked(actions.saveWeeklyResultsMessage).mockResolvedValue({
      ok: true,
      data: { useCustomMessage: true, customMessage: 'Para el sábado' },
    })
    await montar({ kind: 'ready', settings: EMPTY }, { messageReady: false })
    expect(boton(COPY.copyMessage)?.disabled).toBe(true)
    expect(boton(COPY.shareImage)?.disabled).toBe(true)

    await pulsar(interruptor())
    await escribir('Para el sábado')
    await pulsar(boton(COPY.messageSave))

    expect(actions.saveWeeklyResultsMessage).toHaveBeenCalledTimes(1)
    expect(boton(COPY.copyMessage)?.disabled).toBe(true)
    expect(vistaPrevia()).toBeNull()
    expect(writeText).not.toHaveBeenCalled()
  })
})
