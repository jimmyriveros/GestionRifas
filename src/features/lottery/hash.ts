import { createHash } from 'node:crypto'

export function sha256Hex(bytes: Uint8Array | string): string {
  const hash = createHash('sha256')
  hash.update(typeof bytes === 'string' ? bytes : Buffer.from(bytes))
  return hash.digest('hex')
}
