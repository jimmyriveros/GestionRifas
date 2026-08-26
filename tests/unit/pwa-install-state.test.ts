import { beforeEach, describe, expect, it } from 'vitest'

import {
  detectPlatform,
  dismissInstallPrompt,
  INSTALL_DISMISS_DAYS,
  isInstallDismissed,
  isIosSafari,
  silenceInstallPrompt,
} from '@/features/pwa/install-state'

/**
 * Cuando se ofrece instalar la aplicacion y cuando no (D-117).
 *
 * Se prueba aqui y no en el componente porque estas cuatro funciones son las
 * que deciden: el componente solo pinta lo que ellas responden. Equivocarse no
 * rompe ninguna pantalla, pero produce dos molestias que nadie reporta y todo el
 * mundo sufre: ofrecer instalar a quien ya la tiene instalada, y explicarle el
 * menu de Safari a alguien que usa Android.
 */

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.0.0 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36'
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/** Doble de `window` con solo lo que la deteccion mira. */
function fakeWindow(displayModeStandalone: boolean) {
  return {
    matchMedia: (query: string) => ({
      matches: displayModeStandalone && query.includes('standalone'),
    }),
  } as unknown as Window
}

function fakeNavigator(userAgent: string, standalone?: boolean) {
  return { userAgent, standalone } as unknown as Navigator
}

describe('isIosSafari', () => {
  it('reconoce Safari en iPhone', () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true)
  })

  it('NO cuenta Chrome en iPhone', () => {
    // Usa el mismo motor, pero «Compartir → Agregar a pantalla de inicio» no
    // esta donde dicen las instrucciones. Mandar ahi a alguien es peor que
    // callarse.
    expect(isIosSafari(IPHONE_CHROME)).toBe(false)
  })

  it('NO cuenta Android ni escritorio', () => {
    expect(isIosSafari(ANDROID_CHROME)).toBe(false)
    expect(isIosSafari(WINDOWS_CHROME)).toBe(false)
  })
})

describe('detectPlatform', () => {
  it('ya instalada: lo dice la consulta de medios (Android y escritorio)', () => {
    expect(detectPlatform(fakeNavigator(ANDROID_CHROME), fakeWindow(true))).toBe('standalone')
  })

  it('ya instalada: lo dice `navigator.standalone` (iOS antiguo)', () => {
    // iOS tardo en implementar `display-mode`, asi que hacen falta las dos
    // comprobaciones: con solo la primera, un iPhone con la aplicacion ya
    // instalada seguiria viendo el ofrecimiento dentro de ella.
    expect(detectPlatform(fakeNavigator(IPHONE_SAFARI, true), fakeWindow(false))).toBe('standalone')
  })

  it('Safari en iPhone sin instalar: hay que explicar los dos toques', () => {
    expect(detectPlatform(fakeNavigator(IPHONE_SAFARI, false), fakeWindow(false))).toBe(
      'ios-safari',
    )
  })

  it('el resto de navegadores esperan al aviso del propio navegador', () => {
    expect(detectPlatform(fakeNavigator(ANDROID_CHROME), fakeWindow(false))).toBe('other')
    expect(detectPlatform(fakeNavigator(WINDOWS_CHROME), fakeWindow(false))).toBe('other')
  })

  it('no se cae si el navegador no tiene `matchMedia`', () => {
    const win = {} as unknown as Window
    expect(() => detectPlatform(fakeNavigator(ANDROID_CHROME), win)).not.toThrow()
  })
})

describe('memoria del descarte', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('sin descartar, se ofrece', () => {
    expect(isInstallDismissed()).toBe(false)
  })

  it('descartado, se calla durante un mes', () => {
    const now = Date.UTC(2026, 7, 26)
    dismissInstallPrompt(now)

    const unDia = 24 * 60 * 60 * 1000
    expect(isInstallDismissed(now + unDia)).toBe(true)
    expect(isInstallDismissed(now + (INSTALL_DISMISS_DAYS - 1) * unDia)).toBe(true)
    // Pasado el mes vuelve a ofrecerse: puede haber cambiado de telefono.
    expect(isInstallDismissed(now + (INSTALL_DISMISS_DAYS + 1) * unDia)).toBe(false)
  })

  it('instalada, se calla para siempre', () => {
    const now = Date.UTC(2026, 7, 26)
    silenceInstallPrompt()
    const diezAnios = 10 * 365 * 24 * 60 * 60 * 1000
    expect(isInstallDismissed(now + diezAnios)).toBe(true)
  })

  it('un valor corrupto en el almacenamiento no oculta el ofrecimiento', () => {
    window.localStorage.setItem('rifas.pwa.install-dismissed-until', 'manana')
    expect(isInstallDismissed()).toBe(false)
  })
})

describe('iPhone fuera de Safari (el caso que se escapó, D-123)', () => {
  it('Chrome en iPhone se distingue de Safari y de Android', () => {
    // No es un detalle: en iOS la instalación SOLO existe en Safari, así que
    // este caso necesita un texto propio —«ábrela en Safari»— en vez del
    // silencio absoluto que recibía antes.
    expect(detectPlatform(fakeNavigator(IPHONE_CHROME, false), fakeWindow(false))).toBe('ios-other')
    expect(detectPlatform(fakeNavigator(IPHONE_SAFARI, false), fakeWindow(false))).toBe(
      'ios-safari',
    )
    expect(detectPlatform(fakeNavigator(ANDROID_CHROME), fakeWindow(false))).toBe('other')
  })

  it('un iPhone ya instalado no cae en ninguno de los dos', () => {
    expect(detectPlatform(fakeNavigator(IPHONE_CHROME, true), fakeWindow(false))).toBe('standalone')
  })
})
