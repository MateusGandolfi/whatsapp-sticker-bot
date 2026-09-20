import sharp from 'sharp'
import type { ResizeOptions } from 'sharp'
import type { StickerMode } from '../handlers/commandParser.js'
import { StickerError } from './errors.js'

/** Toda figurinha do WhatsApp tem exatamente este tamanho. */
export const STICKER_SIZE = 512

/** Limite do WhatsApp para figurinha estatica. */
export const STATIC_MAX_BYTES = 100 * 1024

/**
 * Degraus de qualidade. O primeiro que couber no orcamento vence, entao uma
 * imagem pequena sai em qualidade alta e so as pesadas descem a escada.
 */
const QUALITY_STEPS = [90, 80, 70, 60, 50, 40, 30, 20] as const

/**
 * Converte uma imagem parada em WebP 512x512.
 *
 * No modo `fit` a proporcao e mantida e a sobra fica transparente. No modo
 * `crop` o centro e recortado para preencher o quadrado. A transparencia de
 * PNG e WebP sobrevive nos dois casos, porque `ensureAlpha` garante o canal
 * alfa e o fundo do preenchimento tem alpha zero.
 */
export async function createStaticSticker(
  input: Buffer,
  mode: StickerMode,
  budgetBytes: number
): Promise<Buffer> {
  const resizeOptions: ResizeOptions =
    mode === 'crop'
      ? { fit: 'cover', position: 'centre' }
      : { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }

  // `failOn: 'none'` faz o sharp tolerar arquivos levemente corrompidos, que
  // sao comuns em midia reencaminhada varias vezes.
  const base = sharp(input, { animated: false, failOn: 'none' })
    .resize(STICKER_SIZE, STICKER_SIZE, resizeOptions)
    .ensureAlpha()

  let smallest: Buffer | null = null

  for (const quality of QUALITY_STEPS) {
    const output = await base
      .clone()
      .webp({ quality, alphaQuality: 100, effort: 4, smartSubsample: true })
      .toBuffer()

    if (output.length <= budgetBytes) return output
    smallest = output
  }

  throw new StickerError(
    'Nao consegui deixar essa imagem abaixo de 100 KB.',
    `menor tentativa: ${smallest?.length ?? 0} bytes, orcamento: ${budgetBytes}`
  )
}
