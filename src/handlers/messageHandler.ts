import {
  downloadMediaMessage,
  getContentType,
  normalizeMessageContent
} from '@whiskeysockets/baileys'
import type { WAMessage, WASocket } from '@whiskeysockets/baileys'
import type { Logger } from 'pino'
import type { AppConfig } from '../config.js'
import { asBaileysLogger } from '../utils/logger.js'
import { jidServer } from '../utils/jid.js'
import type { LidStore } from '../utils/lidStore.js'
import type { RateLimiter } from '../utils/rateLimiter.js'
import type { RecentIds } from '../utils/recentIds.js'
import type { SerialQueue } from '../utils/queue.js'
import type { TempDir } from '../utils/tempFiles.js'
import { buildSticker, StickerError } from '../sticker/index.js'
import { authorize, resolveCounterpartPhone, type SelfIdentity } from './authorization.js'
import { helpText, parseCommand } from './commandParser.js'
import { commandTextOf, resolveMedia } from './mediaResolver.js'

export interface MessageHandlerDeps {
  sock: WASocket
  config: AppConfig
  logger: Logger
  lidStore: LidStore
  rateLimiter: RateLimiter
  queue: SerialQueue
  sentIds: RecentIds
  tempDir: TempDir
  /** Momento em que o processo subiu, em segundos. */
  startedAt: number
  self: SelfIdentity
}

/** Tipos que nunca carregam comando e sao descartados antes de tudo. */
const IGNORED_CONTENT = new Set([
  'protocolMessage',
  'reactionMessage',
  'senderKeyDistributionMessage',
  'messageContextInfo',
  'pollUpdateMessage'
])

export function createMessageHandler(deps: MessageHandlerDeps) {
  const { sock, config, logger, lidStore, rateLimiter, queue, sentIds, tempDir } = deps

  /**
   * Unico ponto de envio do bot. Toda saida passa por aqui, sempre para um
   * `chatJid` que veio da autorizacao, e o id enviado entra na trava anti-loop.
   */
  async function send(
    chatJid: string,
    content: Parameters<WASocket['sendMessage']>[1],
    quoted: WAMessage
  ): Promise<void> {
    const result = await sock.sendMessage(chatJid, content, { quoted })
    sentIds.add(result?.key?.id)
  }

  async function replyText(chatJid: string, text: string, quoted: WAMessage): Promise<void> {
    await send(chatJid, { text }, quoted)
  }

  /**
   * Aprende o par LID/numero sempre que a mensagem trouxer os dois lados.
   * E isso que mantem o reconhecimento de contatos apos reiniciar.
   */
  function learnIdentity(message: WAMessage): void {
    const key = message.key
    if (key.remoteJidAlt) lidStore.remember(key.remoteJid, key.remoteJidAlt)
    if (key.participantAlt) lidStore.remember(key.participant, key.participantAlt)
  }

  async function convertAndSend(
    chatJid: string,
    message: WAMessage,
    mode: 'fit' | 'crop'
  ): Promise<void> {
    const media = resolveMedia(message, deps.self)

    if (!media) {
      await replyText(
        chatJid,
        'Nao achei midia. Mande a imagem, GIF ou video com o comando na legenda, ou responda a uma midia com o comando.',
        message
      )
      return
    }

    if (media.fileLength !== null && media.fileLength > config.maxInputBytes) {
      const limitMb = Math.round(config.maxInputBytes / (1024 * 1024))
      await replyText(chatJid, `Arquivo muito grande. O limite e ${limitMb} MB.`, message)
      return
    }

    const buffer = await downloadMediaMessage(media.message, 'buffer', {}, {
      logger: asBaileysLogger(logger),
      reuploadRequest: sock.updateMediaMessage
    })

    // O tamanho declarado pode faltar, entao confere de novo com o real.
    if (buffer.length > config.maxInputBytes) {
      const limitMb = Math.round(config.maxInputBytes / (1024 * 1024))
      await replyText(chatJid, `Arquivo muito grande. O limite e ${limitMb} MB.`, message)
      return
    }

    const sticker = await buildSticker({
      media: buffer,
      animated: media.animated,
      mode,
      extension: media.extension,
      metadata: { packName: config.packName, packAuthor: config.packAuthor },
      maxSeconds: config.maxVideoSeconds,
      ffmpegPath: config.ffmpegPath,
      tempDir,
      logger
    })

    await send(chatJid, { sticker }, message)

    logger.info(
      { modo: mode, animada: media.animated, bytes: sticker.length, citada: media.fromQuoted },
      'figurinha enviada'
    )
  }

  /** Handler do evento `messages.upsert`. */
  return async function handleUpsert(upsert: {
    messages: WAMessage[]
    type: string
  }): Promise<void> {
    for (const message of upsert.messages) {
      try {
        await handleOne(message)
      } catch (error) {
        // Uma mensagem problematica nunca pode derrubar o loop das outras.
        logger.error({ err: error }, 'falha inesperada ao tratar mensagem')
      }
    }
  }

  async function handleOne(message: WAMessage): Promise<void> {
    if (!message.message) return

    learnIdentity(message)

    // Trava anti-loop: nao reagir ao que o proprio bot enviou.
    if (sentIds.has(message.key.id)) return

    // Mensagens anteriores ao start seriam reprocessadas em rajada a cada
    // reconexao, entao ficam de fora.
    if (config.ignoreOldMessages) {
      const timestamp = Number(message.messageTimestamp ?? 0)
      if (Number.isFinite(timestamp) && timestamp > 0 && timestamp < deps.startedAt) return
    }

    // Desembrulha antes de classificar: uma mensagem temporaria ou de
    // visualizacao unica esconde o tipo real uma camada abaixo.
    const contentType = getContentType(normalizeMessageContent(message.message))
    if (!contentType || IGNORED_CONTENT.has(contentType)) return

    const decision = authorize({
      key: message.key,
      self: deps.self,
      allowedNumbers: config.allowedNumbers,
      lidToPhone: lidStore.lookup
    })

    if (!decision.allowed) {
      // Nivel debug e sem conteudo: o log registra o descarte, nunca a mensagem.
      // Quando o motivo e a lista de autorizados, mostra tambem o numero que o
      // bot conseguiu resolver, que e a unica forma pratica de descobrir por que
      // um contato que deveria passar nao passou.
      logger.debug(
        {
          motivo: decision.reason,
          tipoConversa: jidServer(message.key.remoteJid),
          ...(decision.reason === 'not-authorized'
            ? { numeroResolvido: resolveCounterpartPhone(message.key, lidStore.lookup) }
            : {})
        },
        'mensagem ignorada'
      )
      return
    }

    // O comando e verificado antes do rate limit de proposito: conversa normal
    // nao pode consumir a cota e bloquear um comando legitimo depois.
    const text = commandTextOf(message.message)
    const command = parseCommand(text, config.commandPrefix)

    if (!command) {
      logger.debug(
        { tipoConversa: decision.kind, tipoMensagem: contentType, achouTexto: text !== null },
        'conversa autorizada, mas sem comando'
      )
      return
    }

    if (!rateLimiter.tryConsume(decision.identity)) {
      logger.debug({ tipo: decision.kind }, 'limite por minuto excedido, ignorando em silencio')
      return
    }

    if (command.kind === 'help') {
      await replyText(decision.chatJid, helpText(config.commandPrefix), message)
      return
    }

    const task = queue.run(() => convertAndSend(decision.chatJid, message, command.mode))

    if (task === null) {
      await replyText(decision.chatJid, 'Fila cheia, tente daqui a pouco.', message)
      return
    }

    try {
      await task
    } catch (error) {
      if (error instanceof StickerError) {
        logger.warn({ err: error.message }, 'conversao recusada')
        await replyText(decision.chatJid, error.userMessage, message)
        return
      }

      logger.error({ err: error }, 'erro na conversao')
      await replyText(decision.chatJid, 'Deu erro na conversao. Veja o log.', message)
    }
  }
}
