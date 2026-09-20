import { createHash } from 'node:crypto'
import webpmux from 'node-webpmux'

const { Image } = webpmux

/**
 * Metadados de figurinha.
 *
 * O WhatsApp le o nome do pacote e o autor de um bloco EXIF embutido no WebP,
 * num formato bem especifico: um cabecalho TIFF minimo de 22 bytes seguido do
 * JSON, com o tamanho do JSON gravado em little-endian no offset 14.
 */
export interface StickerMetadata {
  packName: string
  packAuthor: string
  emojis?: string[]
}

const EXIF_HEADER = Buffer.from([
  0x49, 0x49, 0x2a, 0x00, // TIFF little-endian
  0x08, 0x00, 0x00, 0x00, // offset da primeira IFD
  0x01, 0x00, // uma entrada
  0x41, 0x57, // tag 0x5741, onde o WhatsApp guarda o JSON
  0x07, 0x00, // tipo UNDEFINED
  0x00, 0x00, 0x00, 0x00, // tamanho do JSON, preenchido em buildExif
  0x16, 0x00, 0x00, 0x00 // offset do JSON, 22 bytes
])

const JSON_LENGTH_OFFSET = 14

/**
 * Id estavel do pacote, derivado do nome e do autor. Sendo estavel, todas as
 * figurinhas caem no mesmo pacote em vez de criar um novo a cada envio.
 */
function packId(metadata: StickerMetadata): string {
  return createHash('sha256')
    .update(`${metadata.packName}|${metadata.packAuthor}`)
    .digest('hex')
    .slice(0, 32)
}

/** Monta o bloco EXIF cru. */
export function buildExif(metadata: StickerMetadata): Buffer {
  const payload = Buffer.from(
    JSON.stringify({
      'sticker-pack-id': packId(metadata),
      'sticker-pack-name': metadata.packName,
      'sticker-pack-publisher': metadata.packAuthor,
      emojis: metadata.emojis ?? []
    }),
    'utf8'
  )

  const header = Buffer.from(EXIF_HEADER)
  header.writeUInt32LE(payload.length, JSON_LENGTH_OFFSET)

  return Buffer.concat([header, payload])
}

/**
 * Quantos bytes o EXIF vai somar ao arquivo final. Serve para descontar do
 * orcamento antes de comprimir, porque o limite do WhatsApp vale para o arquivo
 * ja com os metadados.
 */
export function exifOverhead(metadata: StickerMetadata): number {
  // O bloco em si, mais a folga do chunk RIFF e do cabecalho VP8X que o
  // node-webpmux adiciona ao converter para o formato estendido.
  return buildExif(metadata).length + 64
}

/** Injeta os metadados num WebP ja pronto. Funciona para estatico e animado. */
export async function applyExif(webp: Buffer, metadata: StickerMetadata): Promise<Buffer> {
  const image = new Image()
  await image.load(webp)
  image.exif = buildExif(metadata)
  return image.save(null)
}
