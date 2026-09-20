import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { Logger } from 'pino'
import type { StickerMode } from '../handlers/commandParser.js'
import { StickerError } from './errors.js'
import { STICKER_SIZE } from './image.js'
import type { TempDir } from '../utils/tempFiles.js'

const execFileAsync = promisify(execFile)

/** Limite do WhatsApp para figurinha animada. */
export const ANIMATED_MAX_BYTES = 500 * 1024

/**
 * Escada de compressao, exatamente na ordem pedida: primeiro a qualidade,
 * depois o fps, e a duracao so em ultimo caso, porque cortar o tempo e a perda
 * mais visivel das tres.
 */
interface Attempt {
  fps: number
  quality: number
  /** Segundos, ou null para usar o maximo configurado. */
  seconds: number | null
}

const ATTEMPTS: readonly Attempt[] = [
  { fps: 15, quality: 75, seconds: null },
  { fps: 15, quality: 60, seconds: null },
  { fps: 15, quality: 45, seconds: null },
  { fps: 12, quality: 45, seconds: null },
  { fps: 10, quality: 45, seconds: null },
  { fps: 10, quality: 35, seconds: 6 },
  { fps: 10, quality: 30, seconds: 4 },
  { fps: 8, quality: 25, seconds: 3 }
]

/**
 * Cadeia de filtros do ffmpeg.
 *
 * `format=rgba` vem antes do redimensionamento de proposito: sem canal alfa na
 * entrada, o preenchimento do modo `fit` sairia preto em vez de transparente.
 */
function buildFilter(mode: StickerMode, fps: number): string {
  const size = STICKER_SIZE

  if (mode === 'crop') {
    return [
      `fps=${fps}`,
      'format=rgba',
      `scale=${size}:${size}:force_original_aspect_ratio=increase:flags=lanczos`,
      `crop=${size}:${size}`,
      'setsar=1'
    ].join(',')
  }

  return [
    `fps=${fps}`,
    'format=rgba',
    `scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
    'setsar=1'
  ].join(',')
}

function buildArgs(
  inputPath: string,
  outputPath: string,
  mode: StickerMode,
  attempt: Attempt,
  maxSeconds: number
): string[] {
  const seconds = Math.min(attempt.seconds ?? maxSeconds, maxSeconds)

  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', inputPath,
    '-t', String(seconds),
    // Figurinha nao tem audio, legenda nem dados anexos.
    '-an', '-sn', '-dn',
    '-vf', buildFilter(mode, attempt.fps),
    '-c:v', 'libwebp',
    '-lossless', '0',
    '-quality', String(attempt.quality),
    '-compression_level', '4',
    '-preset', 'default',
    // 0 significa repetir para sempre.
    '-loop', '0',
    '-pix_fmt', 'yuva420p',
    // Substitui o `-vsync 0`, removido no ffmpeg 8.
    '-fps_mode', 'passthrough',
    outputPath
  ]
}

export interface AnimatedOptions {
  inputPath: string
  mode: StickerMode
  budgetBytes: number
  maxSeconds: number
  ffmpegPath: string
  tempDir: TempDir
  logger: Logger
}

/**
 * Converte GIF ou video em WebP animado 512x512, em loop infinito e sem audio.
 *
 * Tenta a escada de compressao e para na primeira saida que cabe no orcamento.
 */
export async function createAnimatedSticker(options: AnimatedOptions): Promise<Buffer> {
  const { inputPath, mode, budgetBytes, maxSeconds, ffmpegPath, tempDir, logger } = options
  let smallestSize = Number.POSITIVE_INFINITY

  for (const [index, attempt] of ATTEMPTS.entries()) {
    const outputPath = tempDir.path('.webp')

    try {
      await execFileAsync(ffmpegPath, buildArgs(inputPath, outputPath, mode, attempt, maxSeconds), {
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true
      })

      const { size } = await stat(outputPath)
      smallestSize = Math.min(smallestSize, size)

      logger.debug(
        { tentativa: index + 1, fps: attempt.fps, qualidade: attempt.quality, bytes: size },
        'tentativa de figurinha animada'
      )

      if (size <= budgetBytes) return await readFile(outputPath)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)

      if (detail.includes('ENOENT')) {
        throw new StickerError(
          'O ffmpeg nao esta instalado ou nao esta no PATH.',
          `ffmpeg nao encontrado em "${ffmpegPath}"`
        )
      }

      // Uma tentativa pode falhar por parametro que a midia especifica nao
      // aceita. So desiste quando a escada inteira falhar.
      logger.debug({ tentativa: index + 1, err: detail }, 'tentativa de conversao falhou')
    } finally {
      await tempDir.remove(outputPath)
    }
  }

  const menor = Number.isFinite(smallestSize) ? `${Math.round(smallestSize / 1024)} KB` : 'nenhuma'
  throw new StickerError(
    'Nao consegui deixar esse video abaixo de 500 KB. Tente um trecho mais curto.',
    `menor saida: ${menor}, orcamento: ${budgetBytes} bytes`
  )
}
