import { getContentType, normalizeMessageContent } from '@whiskeysockets/baileys'
import type { proto, WAMessage, WAMessageContent } from '@whiskeysockets/baileys'
import { isSameJid } from '../utils/jid.js'
import type { SelfIdentity } from './authorization.js'

/**
 * Localiza o texto do comando e a midia a converter.
 *
 * A midia pode estar na propria mensagem, na legenda, ou numa mensagem citada
 * quando o comando vem como resposta.
 */

export interface ResolvedMedia {
  /** Mensagem pronta para `downloadMediaMessage`, ja remontada se for citada. */
  message: WAMessage
  /** True para GIF e video, que viram WebP animado. */
  animated: boolean
  /** Extensao do arquivo temporario usado pelo ffmpeg. */
  extension: string
  mimetype: string | null
  /** Tamanho declarado pelo WhatsApp, usado para recusar antes de baixar. */
  fileLength: number | null
  /** True quando a midia veio de uma mensagem citada. */
  fromQuoted: boolean
}

function toNumber(value: number | Long | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value.toString())
  return Number.isFinite(parsed) ? parsed : null
}

type Long = { toString(): string }

/** Extensao a partir do mimetype, com um palpite seguro quando falta. */
function extensionFor(mimetype: string | null, animated: boolean): string {
  const clean = (mimetype ?? '').split(';')[0]?.trim().toLowerCase() ?? ''

  const known: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/3gpp': '.3gp'
  }

  return known[clean] ?? (animated ? '.mp4' : '.jpg')
}

/** Lê a midia de um conteudo ja desembrulhado. Devolve null se nao houver. */
function mediaFromContent(
  content: WAMessageContent | undefined
): Omit<ResolvedMedia, 'message' | 'fromQuoted'> | null {
  if (!content) return null

  const image = content.imageMessage
  if (image) {
    const mimetype = image.mimetype ?? null
    // Um "GIF" no WhatsApp geralmente chega como video, mas GIF de verdade
    // tambem aparece como imagem e precisa do caminho animado.
    const animated = (mimetype ?? '').includes('gif')
    return {
      animated,
      mimetype,
      extension: extensionFor(mimetype, animated),
      fileLength: toNumber(image.fileLength)
    }
  }

  const video = content.videoMessage
  if (video) {
    const mimetype = video.mimetype ?? null
    return {
      animated: true,
      mimetype,
      extension: extensionFor(mimetype, true),
      fileLength: toNumber(video.fileLength)
    }
  }

  const sticker = content.stickerMessage
  if (sticker) {
    return {
      animated: sticker.isAnimated === true,
      mimetype: sticker.mimetype ?? 'image/webp',
      extension: '.webp',
      fileLength: toNumber(sticker.fileLength)
    }
  }

  // Imagem ou video enviados como documento, o que acontece quando o remetente
  // marca "enviar sem compressao".
  const document = content.documentMessage
  if (document) {
    const mimetype = document.mimetype ?? null
    const clean = (mimetype ?? '').toLowerCase()
    if (!clean.startsWith('image/') && !clean.startsWith('video/')) return null

    const animated = clean.startsWith('video/') || clean.includes('gif')
    return {
      animated,
      mimetype,
      extension: extensionFor(mimetype, animated),
      fileLength: toNumber(document.fileLength)
    }
  }

  return null
}

/** Pega o `contextInfo` do conteudo, seja qual for o tipo da mensagem. */
function contextInfoOf(content: WAMessageContent | undefined): proto.IContextInfo | null {
  if (!content) return null

  const type = getContentType(content)
  if (!type) return null

  const node = content[type]
  if (node !== null && typeof node === 'object' && 'contextInfo' in node) {
    return (node as { contextInfo?: proto.IContextInfo | null }).contextInfo ?? null
  }
  return null
}

/**
 * Texto que pode conter o comando: corpo da mensagem ou legenda da midia.
 *
 * Desembrulha antes de ler. Sem isso, toda mensagem temporaria, de visualizacao
 * unica ou enviada como documento chega embrulhada e a legenda fica escondida
 * uma camada abaixo, fazendo o comando passar despercebido.
 */
export function commandTextOf(content: WAMessageContent | undefined): string | null {
  const inner = normalizeMessageContent(content)
  if (!inner) return null

  return (
    inner.conversation ??
    inner.extendedTextMessage?.text ??
    inner.imageMessage?.caption ??
    inner.videoMessage?.caption ??
    inner.documentMessage?.caption ??
    null
  )
}

/**
 * Encontra a midia a converter.
 *
 * Prioriza a midia da propria mensagem. Se nao houver, remonta a mensagem
 * citada a partir do `contextInfo`, que e o que permite responder "!s" a uma
 * foto antiga.
 */
export function resolveMedia(message: WAMessage, self: SelfIdentity): ResolvedMedia | null {
  const content = normalizeMessageContent(message.message)
  if (!content) return null

  const own = mediaFromContent(content)
  if (own) {
    return { ...own, message, fromQuoted: false }
  }

  const context = contextInfoOf(content)
  const quotedRaw = context?.quotedMessage
  if (!quotedRaw) return null

  const quoted = normalizeMessageContent(quotedRaw)
  const quotedMedia = mediaFromContent(quoted)
  if (!quotedMedia || !quoted) return null

  const participant = context?.participant ?? null

  // Remontagem minima: `downloadMediaMessage` precisa do conteudo e de uma
  // chave coerente para eventual reenvio da midia.
  const rebuilt: WAMessage = {
    key: {
      remoteJid: message.key.remoteJid ?? null,
      id: context?.stanzaId ?? null,
      fromMe: isSameJid(participant, self.pn) || isSameJid(participant, self.lid),
      ...(participant !== null ? { participant } : {})
    },
    message: quoted
  }

  return { ...quotedMedia, message: rebuilt, fromQuoted: true }
}
