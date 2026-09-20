import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WAMessage, WAMessageContent } from '@whiskeysockets/baileys'
import { commandTextOf, resolveMedia } from './mediaResolver.js'
import type { SelfIdentity } from './authorization.js'

const SELF: SelfIdentity = {
  pn: '5517911111111@s.whatsapp.net',
  lid: '111111111111111@lid'
}

const CONTATO = '5517922222222@s.whatsapp.net'

/** Imagem com o comando na legenda, o caso mais comum. */
const IMAGEM = {
  imageMessage: { caption: '!s', mimetype: 'image/jpeg', fileLength: 1234 }
} as WAMessageContent

function comoMensagem(content: WAMessageContent): WAMessage {
  return {
    key: { remoteJid: CONTATO, fromMe: false, id: 'ABC123' },
    message: content
  }
}

/**
 * Regressao: mensagens temporarias, visualizacao unica e envio como documento
 * chegam embrulhadas numa camada extra. A leitura do comando precisa
 * desembrulhar antes, senao a legenda fica escondida e o bot ignora em silencio.
 *
 * Foi exatamente esse o bug que fez o comando funcionar no self-chat e falhar
 * numa conversa com mensagens temporarias ligadas.
 */
describe('commandTextOf com mensagem embrulhada', () => {
  const embrulhos: Array<[string, WAMessageContent]> = [
    ['sem embrulho', IMAGEM],
    ['mensagem temporaria', { ephemeralMessage: { message: IMAGEM } } as WAMessageContent],
    ['visualizacao unica', { viewOnceMessage: { message: IMAGEM } } as WAMessageContent],
    ['visualizacao unica v2', { viewOnceMessageV2: { message: IMAGEM } } as WAMessageContent],
    [
      'imagem como documento',
      {
        documentWithCaptionMessage: {
          message: {
            documentMessage: { caption: '!s', mimetype: 'image/jpeg', fileLength: 999 }
          }
        }
      } as WAMessageContent
    ]
  ]

  for (const [nome, content] of embrulhos) {
    it(`acha a legenda: ${nome}`, () => {
      assert.equal(commandTextOf(content), '!s')
    })

    it(`acha a midia: ${nome}`, () => {
      assert.notEqual(resolveMedia(comoMensagem(content), SELF), null)
    })
  }

  it('devolve null quando nao ha texto nenhum', () => {
    assert.equal(commandTextOf(undefined), null)
    assert.equal(commandTextOf({ imageMessage: { mimetype: 'image/jpeg' } }), null)
  })
})

describe('commandTextOf por tipo de mensagem', () => {
  it('le o corpo de uma mensagem de texto simples', () => {
    assert.equal(commandTextOf({ conversation: '!help' }), '!help')
  })

  it('le o texto de uma resposta', () => {
    assert.equal(commandTextOf({ extendedTextMessage: { text: '!sc' } }), '!sc')
  })

  it('le a legenda de video', () => {
    assert.equal(
      commandTextOf({ videoMessage: { caption: '!s', mimetype: 'video/mp4' } }),
      '!s'
    )
  })
})

describe('resolveMedia', () => {
  it('classifica video como animado', () => {
    const media = resolveMedia(
      comoMensagem({ videoMessage: { caption: '!s', mimetype: 'video/mp4', fileLength: 10 } }),
      SELF
    )
    assert.equal(media?.animated, true)
    assert.equal(media?.extension, '.mp4')
  })

  it('classifica GIF como animado mesmo chegando como imagem', () => {
    const media = resolveMedia(
      comoMensagem({ imageMessage: { caption: '!s', mimetype: 'image/gif', fileLength: 10 } }),
      SELF
    )
    assert.equal(media?.animated, true)
  })

  it('classifica foto como estatica', () => {
    const media = resolveMedia(comoMensagem(IMAGEM), SELF)
    assert.equal(media?.animated, false)
    assert.equal(media?.fromQuoted, false)
    assert.equal(media?.fileLength, 1234)
  })

  it('usa a midia citada quando o comando vem numa resposta', () => {
    const media = resolveMedia(
      comoMensagem({
        extendedTextMessage: {
          text: '!s',
          contextInfo: {
            stanzaId: 'ORIGINAL1',
            participant: CONTATO,
            quotedMessage: { imageMessage: { mimetype: 'image/png', fileLength: 55 } }
          }
        }
      }),
      SELF
    )

    assert.equal(media?.fromQuoted, true)
    assert.equal(media?.message.key.id, 'ORIGINAL1')
    // A midia citada e dela, entao nao pode ser marcada como minha.
    assert.equal(media?.message.key.fromMe, false)
  })

  it('marca como minha a midia citada que eu mesmo enviei', () => {
    const media = resolveMedia(
      comoMensagem({
        extendedTextMessage: {
          text: '!s',
          contextInfo: {
            stanzaId: 'ORIGINAL2',
            participant: SELF.pn,
            quotedMessage: { imageMessage: { mimetype: 'image/png', fileLength: 55 } }
          }
        }
      }),
      SELF
    )

    assert.equal(media?.message.key.fromMe, true)
  })

  it('devolve null quando nao ha midia em lugar nenhum', () => {
    assert.equal(resolveMedia(comoMensagem({ conversation: '!s' }), SELF), null)
  })

  it('recusa documento que nao e imagem nem video', () => {
    const media = resolveMedia(
      comoMensagem({
        documentMessage: { caption: '!s', mimetype: 'application/pdf', fileLength: 10 }
      }),
      SELF
    )
    assert.equal(media, null)
  })
})
