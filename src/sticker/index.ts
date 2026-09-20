import type { Logger } from 'pino'
import type { StickerMode } from '../handlers/commandParser.js'
import type { TempDir } from '../utils/tempFiles.js'
import { ANIMATED_MAX_BYTES, createAnimatedSticker } from './animated.js'
import { applyExif, exifOverhead, type StickerMetadata } from './exif.js'
import { createStaticSticker, STATIC_MAX_BYTES } from './image.js'

export { StickerError } from './errors.js'
export { ANIMATED_MAX_BYTES } from './animated.js'
export { STATIC_MAX_BYTES, STICKER_SIZE } from './image.js'
export type { StickerMetadata } from './exif.js'

export interface BuildStickerOptions {
  media: Buffer
  /** GIF e video viram WebP animado, o resto vira WebP parado. */
  animated: boolean
  mode: StickerMode
  /** Extensao do arquivo temporario, usada so no caminho animado. */
  extension: string
  metadata: StickerMetadata
  maxSeconds: number
  ffmpegPath: string
  tempDir: TempDir
  logger: Logger
}

/**
 * Ponto unico de conversao: escolhe o caminho parado ou animado, comprime ate
 * caber e injeta os metadados do pacote.
 *
 * O orcamento passado aos conversores ja desconta o EXIF, porque o limite do
 * WhatsApp vale para o arquivo final, com metadados incluidos.
 */
export async function buildSticker(options: BuildStickerOptions): Promise<Buffer> {
  const { media, animated, mode, extension, metadata, tempDir, logger } = options

  const limit = animated ? ANIMATED_MAX_BYTES : STATIC_MAX_BYTES
  const budget = limit - exifOverhead(metadata)

  let webp: Buffer
  let inputPath: string | null = null

  try {
    if (animated) {
      // O ffmpeg precisa de entrada seekable: MP4 vindo de pipe nao funciona.
      inputPath = await tempDir.writeTemp(media, extension)
      webp = await createAnimatedSticker({
        inputPath,
        mode,
        budgetBytes: budget,
        maxSeconds: options.maxSeconds,
        ffmpegPath: options.ffmpegPath,
        tempDir,
        logger
      })
    } else {
      webp = await createStaticSticker(media, mode, budget)
    }
  } finally {
    await tempDir.remove(inputPath)
  }

  const withMetadata = await applyExif(webp, metadata)

  if (withMetadata.length > limit) {
    logger.warn(
      { bytes: withMetadata.length, limite: limit },
      'figurinha passou do limite depois do EXIF, enviando mesmo assim'
    )
  }

  return withMetadata
}
