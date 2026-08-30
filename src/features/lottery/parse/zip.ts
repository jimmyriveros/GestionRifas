import { inflateRawSync } from 'node:zlib'

/**
 * Lector minimo de ZIP (store + deflate) para hojas XLSX. No se anade una
 * libreria de Excel: el cronograma CNJSA es un xlsx pequeno y conocido (D-144).
 */
export function readZipEntries(bytes: Uint8Array): Map<string, Buffer> {
  const buf = Buffer.from(bytes)
  const entries = new Map<string, Buffer>()
  let offset = 0

  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break
    const method = buf.readUInt16LE(offset + 8)
    const compSize = buf.readUInt32LE(offset + 18)
    const uncompSize = buf.readUInt32LE(offset + 22)
    const nameLen = buf.readUInt16LE(offset + 26)
    const extraLen = buf.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const name = buf.subarray(nameStart, nameStart + nameLen).toString('utf8')
    const dataStart = nameStart + nameLen + extraLen
    const compressed = buf.subarray(dataStart, dataStart + compSize)

    let data: Buffer
    if (method === 0) {
      data = Buffer.from(compressed)
    } else if (method === 8) {
      data = inflateRawSync(compressed, { maxOutputLength: Math.max(uncompSize, 1) })
    } else {
      throw new Error(`ZIP con compresion no soportada (${method}) en ${name}`)
    }

    entries.set(name.replace(/\\/g, '/'), data)
    offset = dataStart + compSize
  }

  return entries
}

export function writeZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content)
    const nameBuf = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    nameBuf.copy(local, 30)
    parts.push(local, data)

    const cen = Buffer.alloc(46 + nameBuf.length)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4)
    cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt32LE(data.length, 20)
    cen.writeUInt32LE(data.length, 24)
    cen.writeUInt32LE(offset, 42)
    nameBuf.copy(cen, 46)
    central.push(cen)
    offset += local.length + data.length
  }

  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(central.length, 8)
  end.writeUInt16LE(central.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, centralBuf, end])
}
