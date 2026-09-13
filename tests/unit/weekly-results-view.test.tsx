/**
 * Lo que se pinta de «Resultados de la semana» en cada estado (BR-H02, BR-H03,
 * BR-H07, BR-H09).
 *
 * Se renderiza en el servidor con `react-dom/server`, que es lo que llega antes
 * de hidratar: ahí tiene que estar ya la verdad de cada estado —qué botones
 * existen y cuáles están desactivados—, porque no se puede ofrecer algo que no
 * está listo ni un segundo. El comportamiento en el navegador (compartir,
 * descargar, copiar, editar y guardar el mensaje) lo cubren
 * `weekly-results-message.test.tsx` y las pruebas E2E.
 *
 * Las lecturas y la Server Action se sustituyen por dobles: aquí se prueba qué
 * hace la pantalla con cada respuesta, no la base (`tests/db/weekly-results*.test.ts`).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LOTTERY_CODES, type LotteryCode } from '@/features/lottery/constants'
import {
  EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS,
  type WeeklyResultsMessageSettingsResult,
} from '@/features/weekly-results/message'
import type { WeeklyResults } from '@/features/weekly-results/results'
import { buildWeeklyResults } from '@/features/weekly-results/results'
import { lotteryReferenceDate, type ResultsWeek } from '@/features/weekly-results/week'

vi.mock('@/features/weekly-results/queries', () => ({
  getWeeklyResults: vi.fn(),
  getWeeklyResultsRaffle: vi.fn(),
  getWeeklyResultsMessageSettings: vi.fn(),
}))
vi.mock('@/features/weekly-results/actions', () => ({ saveWeeklyResultsMessage: vi.fn() }))
vi.mock('@/features/whatsapp/queries', () => ({ getWhatsappSettings: vi.fn() }))

const queries = await import('@/features/weekly-results/queries')
const whatsapp = await import('@/features/whatsapp/queries')
const { WeeklyResultsContent, WeeklyResultsError } =
  await import('@/features/weekly-results/components/WeeklyResultsSection')
const { WeeklyResultsSummary } =
  await import('@/features/weekly-results/components/WeeklyResultsSummary')
const { WeeklyResultsShare } =
  await import('@/features/weekly-results/components/WeeklyResultsShare')
const { WEEKLY_RESULTS_COPY } = await import('@/features/weekly-results/copy')

const AUG: ResultsWeek = { monday: '2026-08-17', saturday: '2026-08-22' }
const GROUP = 'https://chat.whatsapp.com/AbCdEf123456'
const SHARE = WEEKLY_RESULTS_COPY.share

const NUMBERS: Record<LotteryCode, string> = {
  cundinamarca: '2718',
  cruz_roja: '3141',
  meta: '0046',
  bogota: '1618',
  medellin: '5772',
  boyaca: '0007',
}

function week(
  overrides: Partial<
    Record<
      LotteryCode,
      {
        winningNumber: string | null
        validationStatus: 'pending' | 'conflict' | 'confirmed' | 'rejected'
      }
    >
  > = {},
): Exclude<WeeklyResults, { kind: 'error' }> {
  return buildWeeklyResults(
    AUG,
    LOTTERY_CODES.map((code) => ({
      lotteryCode: code,
      referenceDate: lotteryReferenceDate(AUG, code),
      result: overrides[code] ?? { winningNumber: NUMBERS[code], validationStatus: 'confirmed' },
    })),
  )
}

function dom(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
}

function button(doc: Document, name: string): HTMLButtonElement | undefined {
  return [...doc.querySelectorAll('button')].find((item) => item.textContent?.includes(name))
}

function link(doc: Document, name: string): HTMLAnchorElement | undefined {
  return [...doc.querySelectorAll('a')].find((item) => item.textContent?.includes(name))
}

function ready(
  settings: Partial<typeof EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS> = {},
): WeeklyResultsMessageSettingsResult {
  return { kind: 'ready', settings: { ...EMPTY_WEEKLY_RESULTS_MESSAGE_SETTINGS, ...settings } }
}

const shareProps = {
  imageUrl: '/api/weekly-results/image?week=2026-08-17',
  fileName: 'resultados-semana-2026-08-17.png',
  imageAlt:
    'Imagen de los resultados de la semana del 17 al 22 de agosto de 2026, lista para compartir',
  defaultMessage: 'Mensaje de prueba',
  messageReady: true,
  messageSettings: ready(),
  unavailableText: null,
  groupUrl: GROUP,
  copy: SHARE,
}

describe('el resumen de la semana', () => {
  it('listo: seis de seis, los números con sus ceros y la rifa del catálogo', () => {
    const doc = dom(
      renderToStaticMarkup(
        <WeeklyResultsSummary results={week()} raffleName="Sorteo Camioneta KIA 2026" />,
      ),
    )
    const text = doc.body.textContent ?? ''
    expect(text).toContain('Semana del 17 al 22 de agosto de 2026')
    expect(text).toContain('6 de 6 resultados')
    expect(text).toContain('Rifa de tu catálogo: Sorteo Camioneta KIA 2026')
    expect(text).toContain('0046')
    expect(text).toContain('0007')
    expect(text).not.toContain('Falta')
  })

  it('pendiente: dice cuál falta, y la fila lo dice con palabras', () => {
    const doc = dom(
      renderToStaticMarkup(
        <WeeklyResultsSummary
          results={week({ meta: { winningNumber: null, validationStatus: 'pending' } })}
          raffleName="Rifa"
        />,
      ),
    )
    const text = doc.body.textContent ?? ''
    expect(text).toContain('5 de 6 resultados')
    expect(text).toContain('Falta el resultado de Meta.')
    expect(doc.querySelector('[data-lottery="meta"]')?.textContent).toContain('Resultado pendiente')
  })

  it('varios pendientes: los nombra todos', () => {
    const doc = dom(
      renderToStaticMarkup(
        <WeeklyResultsSummary
          results={week({
            meta: { winningNumber: null, validationStatus: 'pending' },
            boyaca: { winningNumber: null, validationStatus: 'rejected' },
          })}
          raffleName="Rifa"
        />,
      ),
    )
    expect(doc.body.textContent).toContain('Faltan los resultados de Meta y Boyacá.')
  })

  it('un conflicto no enseña su número', () => {
    const doc = dom(
      renderToStaticMarkup(
        <WeeklyResultsSummary
          results={week({ bogota: { winningNumber: '9217', validationStatus: 'conflict' } })}
          raffleName="Rifa"
        />,
      ),
    )
    const fila = doc.querySelector('[data-lottery="bogota"]')?.textContent ?? ''
    expect(fila).toContain('Requiere verificación')
    expect(doc.body.textContent).not.toContain('9217')
  })

  it('sin rifa configurada: lo explica y dice a quién pedirla', () => {
    const doc = dom(
      renderToStaticMarkup(<WeeklyResultsSummary results={week()} raffleName={null} />),
    )
    expect(doc.body.textContent).toContain('Tu catálogo todavía no tiene una rifa.')
    expect(doc.body.textContent).toContain('quien administra la rifa')
  })
})

describe('compartir con el grupo', () => {
  it('lista: prepara la imagen, enseña el mensaje y abre el grupo en otra pestaña', () => {
    const doc = dom(renderToStaticMarkup(<WeeklyResultsShare {...shareProps} />))
    expect(doc.body.textContent).toContain('Preparando imagen…')
    expect(doc.querySelector('[data-slot="weekly-results-message"]')?.textContent).toBe(
      'Mensaje de prueba',
    )

    // Compartir espera a que la imagen esté en memoria; copiar no espera a nada.
    expect(button(doc, 'Compartir imagen')?.disabled).toBe(true)
    expect(button(doc, 'Copiar mensaje')?.disabled).toBe(false)

    const grupo = link(doc, 'Abrir mi grupo')
    expect(grupo?.getAttribute('href')).toBe(GROUP)
    expect(grupo?.getAttribute('target')).toBe('_blank')
    expect(grupo?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('pendiente: nada de imagen, ni mensaje, ni acciones que no están listas', () => {
    const doc = dom(
      renderToStaticMarkup(
        <WeeklyResultsShare
          {...shareProps}
          imageUrl={null}
          messageReady={false}
          unavailableText={SHARE.previewPending}
        />,
      ),
    )
    expect(doc.querySelector('img')).toBeNull()
    expect(doc.body.textContent).toContain(SHARE.previewPending)
    expect(doc.body.textContent).toContain(SHARE.messagePending)
    expect(doc.querySelector('[data-slot="weekly-results-message"]')).toBeNull()
    for (const name of ['Compartir imagen', 'Descargar imagen', 'Copiar mensaje']) {
      expect(button(doc, name)?.disabled, name).toBe(true)
    }
  })

  it('sin grupo: se explica y se ofrece configurarlo, sin tocar lo demás', () => {
    const doc = dom(renderToStaticMarkup(<WeeklyResultsShare {...shareProps} groupUrl={null} />))
    expect(doc.body.textContent).toContain('Todavía no has configurado tu grupo de WhatsApp.')
    expect(link(doc, 'Configurar WhatsApp')?.getAttribute('href')).toBe('/seller/settings/whatsapp')
    expect(link(doc, 'Abrir mi grupo')).toBeUndefined()
    expect(button(doc, 'Copiar mensaje')?.disabled).toBe(false)
  })

  it('un enlace que no es de un grupo de WhatsApp no se abre', () => {
    const doc = dom(
      renderToStaticMarkup(
        <WeeklyResultsShare {...shareProps} groupUrl="https://example.com/grupo" />,
      ),
    )
    expect(link(doc, 'Abrir mi grupo')).toBeUndefined()
    expect(doc.body.innerHTML).not.toContain('example.com')
  })
})

describe('el mensaje propio en el HTML (BR-H09, D-197)', () => {
  function textarea(doc: Document): HTMLTextAreaElement {
    const area = doc.querySelector<HTMLTextAreaElement>('textarea')
    expect(area).not.toBeNull()
    return area!
  }

  function switchOf(doc: Document): HTMLButtonElement {
    const control = doc.querySelector<HTMLButtonElement>('[role="switch"]')
    expect(control).not.toBeNull()
    return control!
  }

  it('sin personalizar: el predeterminado, en modo lectura y en la vista previa', () => {
    const doc = dom(renderToStaticMarkup(<WeeklyResultsShare {...shareProps} />))

    expect(switchOf(doc).getAttribute('aria-checked')).toBe('false')
    expect(textarea(doc).readOnly).toBe(true)
    expect(textarea(doc).value).toBe('Mensaje de prueba')
    // El área la nombra el título de la sección, sin repetirlo a la vista.
    expect(textarea(doc).getAttribute('aria-labelledby')).toBe('resultados-semana-mensaje')
    expect(doc.getElementById('resultados-semana-mensaje')?.textContent).toBe(SHARE.messageTitle)
    expect(doc.body.textContent).toContain(SHARE.messageDefaultHint)
    expect(doc.body.textContent).toContain(SHARE.messagePreview)
    expect(button(doc, SHARE.messageSave)?.disabled).toBe(false)
    expect(button(doc, SHARE.messageRestore)).toBeUndefined()
  })

  it('con mensaje propio: editable, sustituye al predeterminado y ofrece volver', () => {
    const doc = dom(
      renderToStaticMarkup(
        <WeeklyResultsShare
          {...shareProps}
          messageSettings={ready({ useCustomMessage: true, customMessage: 'Hola, grupo' })}
        />,
      ),
    )

    expect(switchOf(doc).getAttribute('aria-checked')).toBe('true')
    expect(textarea(doc).readOnly).toBe(false)
    expect(textarea(doc).value).toBe('Hola, grupo')
    expect(textarea(doc).maxLength).toBe(1000)
    expect(doc.querySelector('[data-slot="weekly-results-message"]')?.textContent).toBe(
      'Hola, grupo',
    )
    expect(doc.body.textContent).not.toContain('Mensaje de prueba')
    expect(doc.body.textContent).toContain(SHARE.messageCustomHint)
    expect(button(doc, SHARE.messageRestore)?.disabled).toBe(false)
  })

  it('apagado con un texto conservado: se ve y se comparte el predeterminado', () => {
    const doc = dom(
      renderToStaticMarkup(
        <WeeklyResultsShare
          {...shareProps}
          messageSettings={ready({ useCustomMessage: false, customMessage: 'Guardado' })}
        />,
      ),
    )
    expect(textarea(doc).value).toBe('Mensaje de prueba')
    expect(doc.querySelector('[data-slot="weekly-results-message"]')?.textContent).toBe(
      'Mensaje de prueba',
    )
  })

  it('el texto propio NO se interpreta como HTML', () => {
    const hostil = '<img src=x onerror="alert(1)"><b>negrita</b><script>alert(2)</script>'
    const html = renderToStaticMarkup(
      <WeeklyResultsShare
        {...shareProps}
        messageSettings={ready({ useCustomMessage: true, customMessage: hostil })}
      />,
    )
    const doc = dom(html)

    expect(doc.querySelector('b')).toBeNull()
    expect(doc.querySelector('script')).toBeNull()
    // La vista previa está cargando la imagen: si hubiera un <img>, sería el del texto.
    expect(doc.querySelector('img')).toBeNull()
    expect(html).toContain('&lt;img')
    expect(textarea(doc).value).toBe(hostil)
    expect(doc.querySelector('[data-slot="weekly-results-message"]')?.textContent).toBe(hostil)
  })

  it('los saltos de línea y los emojis llegan tal cual a la vista previa', () => {
    const texto = 'Línea uno 🎉\n\nLínea dos: ¿ñandú?'
    const doc = dom(
      renderToStaticMarkup(
        <WeeklyResultsShare
          {...shareProps}
          messageSettings={ready({ useCustomMessage: true, customMessage: texto })}
        />,
      ),
    )
    const vista = doc.querySelector('[data-slot="weekly-results-message"]')
    expect(vista?.textContent).toBe(texto)
    expect(vista?.className).toContain('whitespace-pre-wrap')
  })

  it('pendiente: se puede preparar el mensaje, pero no se copia ni se comparte', () => {
    const doc = dom(
      renderToStaticMarkup(
        <WeeklyResultsShare
          {...shareProps}
          imageUrl={null}
          messageReady={false}
          unavailableText={SHARE.previewPending}
          messageSettings={ready({ useCustomMessage: true, customMessage: 'Listo para el sábado' })}
        />,
      ),
    )
    expect(switchOf(doc).disabled).toBe(false)
    expect(textarea(doc).disabled).toBe(false)
    expect(button(doc, SHARE.messageSave)?.disabled).toBe(false)
    expect(button(doc, 'Copiar mensaje')?.disabled).toBe(true)
    expect(button(doc, 'Compartir imagen')?.disabled).toBe(true)
    expect(doc.querySelector('[data-slot="weekly-results-message"]')).toBeNull()
  })

  it('si su configuración no se pudo leer: lo dice, no ofrece guardar y usa el predeterminado', () => {
    const doc = dom(
      renderToStaticMarkup(
        <WeeklyResultsShare {...shareProps} messageSettings={{ kind: 'error' }} />,
      ),
    )
    expect(doc.body.textContent).toContain(SHARE.messageLoadFailed)
    expect(doc.querySelector('[role="switch"]')).toBeNull()
    expect(doc.querySelector('textarea')).toBeNull()
    expect(button(doc, SHARE.messageSave)).toBeUndefined()
    expect(link(doc, 'Reintentar')?.getAttribute('href')).toBe('/seller/settings/weekly-results')
    expect(doc.querySelector('[data-slot="weekly-results-message"]')?.textContent).toBe(
      'Mensaje de prueba',
    )
  })
})

describe('los estados de la sección entera', () => {
  beforeEach(() => {
    vi.mocked(whatsapp.getWhatsappSettings).mockResolvedValue({
      groupUrl: GROUP,
      useCustomMessage: false,
      customMessage: null,
    })
    vi.mocked(queries.getWeeklyResultsMessageSettings).mockResolvedValue(ready())
  })

  it('error: lo dice y ofrece reintentar en la misma pantalla', async () => {
    vi.mocked(queries.getWeeklyResults).mockResolvedValue({ kind: 'error', week: AUG })
    vi.mocked(queries.getWeeklyResultsRaffle).mockResolvedValue({ kind: 'ready', name: 'Rifa' })

    const doc = dom(renderToStaticMarkup(await WeeklyResultsContent({ profileId: 'p', week: AUG })))
    expect(doc.body.textContent).toContain('No pudimos cargar los resultados de la semana')
    expect(link(doc, 'Reintentar')?.getAttribute('href')).toBe('/seller/settings/weekly-results')
    expect(doc.querySelector('[data-slot="weekly-results-share"]')).toBeNull()
  })

  it('sin rifa: resultados a la vista, pero ni imagen ni mensaje', async () => {
    vi.mocked(queries.getWeeklyResults).mockResolvedValue(week())
    vi.mocked(queries.getWeeklyResultsRaffle).mockResolvedValue({ kind: 'none' })

    const doc = dom(renderToStaticMarkup(await WeeklyResultsContent({ profileId: 'p', week: AUG })))
    expect(doc.body.textContent).toContain('0046')
    expect(doc.body.textContent).toContain(SHARE.previewNoRaffle)
    expect(button(doc, 'Descargar imagen')?.disabled).toBe(true)
    expect(button(doc, 'Copiar mensaje')?.disabled).toBe(true)
  })

  it('listo: el mensaje sale con la semana', async () => {
    vi.mocked(queries.getWeeklyResults).mockResolvedValue(week())
    vi.mocked(queries.getWeeklyResultsRaffle).mockResolvedValue({
      kind: 'ready',
      name: 'Rifa 2026',
    })

    const doc = dom(renderToStaticMarkup(await WeeklyResultsContent({ profileId: 'p', week: AUG })))
    expect(doc.querySelector('[data-slot="weekly-results-message"]')?.textContent).toContain(
      'del 17 al 22 de agosto de 2026',
    )
    expect(
      doc.querySelector('[data-slot="weekly-results-preview"]')?.getAttribute('data-state'),
    ).toBe('loading')
  })

  it('listo con mensaje propio: sale el suyo, sin la semana del predeterminado', async () => {
    vi.mocked(queries.getWeeklyResults).mockResolvedValue(week())
    vi.mocked(queries.getWeeklyResultsRaffle).mockResolvedValue({ kind: 'ready', name: 'Rifa' })
    vi.mocked(queries.getWeeklyResultsMessageSettings).mockResolvedValue(
      ready({ useCustomMessage: true, customMessage: 'Mi mensaje de siempre' }),
    )

    const doc = dom(renderToStaticMarkup(await WeeklyResultsContent({ profileId: 'p', week: AUG })))
    expect(doc.querySelector('[data-slot="weekly-results-message"]')?.textContent).toBe(
      'Mi mensaje de siempre',
    )
  })

  it('si falla la lectura del mensaje, la sección se pinta igual', async () => {
    vi.mocked(queries.getWeeklyResults).mockResolvedValue(week())
    vi.mocked(queries.getWeeklyResultsRaffle).mockResolvedValue({ kind: 'ready', name: 'Rifa' })
    vi.mocked(queries.getWeeklyResultsMessageSettings).mockResolvedValue({ kind: 'error' })

    const doc = dom(renderToStaticMarkup(await WeeklyResultsContent({ profileId: 'p', week: AUG })))
    expect(doc.querySelector('[data-slot="weekly-results-summary"]')).not.toBeNull()
    expect(doc.body.textContent).toContain(SHARE.messageLoadFailed)
    expect(button(doc, 'Copiar mensaje')?.disabled).toBe(false)
    expect(doc.querySelector('[data-slot="weekly-results-message"]')?.textContent).toContain(
      'del 17 al 22 de agosto de 2026',
    )
  })

  it('el error solo, fuera de la sección, también se entiende', () => {
    expect(renderToStaticMarkup(<WeeklyResultsError />)).toContain('Reintentar')
  })
})
