import { expect } from '@playwright/test'

/**
 * El buzón de Mailpit de la pila local (`supabase/config.toml`, `[local_smtp]`): ahí acaban los
 * correos de Auth en desarrollo. Solo lectura. Lo usan las E2E que siguen un enlace de verdad
 * (D-253, D-254).
 */
export const MAILPIT = 'http://127.0.0.1:54324'

type Summary = { ID: string; Subject: string; To: { Address: string }[] }

async function summaries(): Promise<Summary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`)
  return ((await res.json()) as { messages: Summary[] }).messages
}

/** Los correos que ya había: lo que llegue después es lo nuevo. */
export async function mailIds(): Promise<Set<string>> {
  return new Set((await summaries()).map((m) => m.ID))
}

export type Mail = { subject: string; links: string[] }

/** El primer correo NUEVO para `to`, con sus enlaces; espera hasta 15 s. */
export async function waitForMail(to: string, before: Set<string>): Promise<Mail> {
  let found: Summary | undefined
  await expect
    .poll(
      async () => {
        found = (await summaries()).find(
          (m) => !before.has(m.ID) && m.To.some((t) => t.Address === to),
        )
        return Boolean(found)
      },
      { timeout: 15_000, message: `no llegó a Mailpit ningún correo nuevo para ${to}` },
    )
    .toBe(true)

  const full = (await (await fetch(`${MAILPIT}/api/v1/message/${found!.ID}`)).json()) as {
    Text: string
    HTML: string
  }
  const links = new Set<string>()
  for (const body of [full.Text, full.HTML]) {
    for (const match of body.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
      links.add(match[0].replaceAll('&amp;', '&'))
    }
  }
  return { subject: found!.Subject, links: [...links] }
}
