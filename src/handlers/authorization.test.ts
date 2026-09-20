import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  authorize,
  buildSelfIdentity,
  parseAllowedNumbers,
  resolveCounterpartPhone,
  type AuthorizableKey,
  type AuthorizeResult,
  type SelfIdentity
} from './authorization.js'

const MEU_NUMERO = '5517911111111'
const MEU_LID = '111111111111111'
const AUTORIZADO = '5517922222222'
const AUTORIZADO_LID = '222222222222222'
const ESTRANHO = '5517933333333'

const SELF: SelfIdentity = {
  pn: `${MEU_NUMERO}@s.whatsapp.net`,
  lid: `${MEU_LID}@lid`
}

const PERMITIDOS = parseAllowedNumbers(`${AUTORIZADO}, +55 17 94444-4444`)

function decidir(
  key: AuthorizableKey,
  lidToPhone?: (lid: string) => string | null
): AuthorizeResult {
  return authorize({ key, self: SELF, allowedNumbers: PERMITIDOS, lidToPhone })
}

function negado(result: AuthorizeResult): string {
  assert.equal(result.allowed, false, 'esperava rejeicao, mas foi autorizado')
  return result.allowed ? '' : result.reason
}

describe('parseAllowedNumbers', () => {
  it('limpa a formatacao e monta o conjunto', () => {
    const numeros = parseAllowedNumbers('+55 (17) 99999-9999, 5517888888888')
    assert.deepEqual([...numeros].sort(), ['5517888888888', '5517999999999'])
  })

  it('descarta entradas vazias ou curtas demais', () => {
    assert.equal(parseAllowedNumbers(' , , 123').size, 0)
    assert.equal(parseAllowedNumbers(undefined).size, 0)
  })
})

describe('buildSelfIdentity', () => {
  it('normaliza o id removendo o dispositivo', () => {
    const identidade = buildSelfIdentity({
      id: `${MEU_NUMERO}:47@s.whatsapp.net`,
      lid: `${MEU_LID}:47@lid`
    })
    assert.deepEqual(identidade, {
      pn: `${MEU_NUMERO}@s.whatsapp.net`,
      lid: `${MEU_LID}@lid`
    })
  })

  it('aguenta usuario ausente antes da conexao abrir', () => {
    assert.deepEqual(buildSelfIdentity(undefined), { pn: null, lid: null })
  })
})

describe('self-chat', () => {
  it('autoriza a minha conversa comigo, em formato de numero', () => {
    const result = decidir({
      remoteJid: `${MEU_NUMERO}@s.whatsapp.net`,
      fromMe: true
    })
    assert.deepEqual(result, {
      allowed: true,
      kind: 'self',
      chatJid: `${MEU_NUMERO}@s.whatsapp.net`,
      identity: `${MEU_NUMERO}@s.whatsapp.net`
    })
  })

  it('autoriza a minha conversa comigo em formato lid', () => {
    const result = decidir({ remoteJid: `${MEU_LID}@lid`, fromMe: true })
    assert.equal(result.allowed, true)
    assert.equal(result.allowed && result.kind, 'self')
  })

  it('autoriza mesmo com sufixo de dispositivo', () => {
    const result = decidir({ remoteJid: `${MEU_NUMERO}:19@s.whatsapp.net`, fromMe: true })
    assert.equal(result.allowed, true)
  })

  it('rejeita self-chat que nao veio de mim', () => {
    const result = decidir({ remoteJid: `${MEU_NUMERO}@s.whatsapp.net`, fromMe: false })
    assert.equal(negado(result), 'self-chat-not-from-me')
  })
})

describe('conversas proibidas', () => {
  it('rejeita grupo mesmo com contato autorizado dentro', () => {
    const result = decidir({
      remoteJid: '120363000000000000@g.us',
      fromMe: false,
      participant: `${AUTORIZADO}@s.whatsapp.net`
    })
    assert.equal(negado(result), 'group')
  })

  it('rejeita grupo mesmo quando fui eu que mandei', () => {
    const result = decidir({
      remoteJid: '120363000000000000@g.us',
      fromMe: true,
      participant: `${MEU_NUMERO}@s.whatsapp.net`
    })
    assert.equal(negado(result), 'group')
  })

  it('rejeita status e broadcast', () => {
    assert.equal(
      negado(decidir({ remoteJid: 'status@broadcast', fromMe: true })),
      'status-broadcast'
    )
    assert.equal(
      negado(decidir({ remoteJid: '5517911111111@broadcast', fromMe: true })),
      'broadcast'
    )
  })

  it('rejeita newsletter', () => {
    assert.equal(
      negado(decidir({ remoteJid: '120363000000000000@newsletter', fromMe: false })),
      'newsletter'
    )
  })

  it('rejeita mensagem sem remetente', () => {
    assert.equal(negado(decidir({ remoteJid: null, fromMe: true })), 'no-remote-jid')
  })
})

describe('contatos autorizados', () => {
  it('autoriza mensagem enviada pelo contato', () => {
    const result = decidir({ remoteJid: `${AUTORIZADO}@s.whatsapp.net`, fromMe: false })
    assert.deepEqual(result, {
      allowed: true,
      kind: 'contact',
      chatJid: `${AUTORIZADO}@s.whatsapp.net`,
      identity: AUTORIZADO
    })
  })

  it('autoriza mensagem que EU enviei na conversa dele', () => {
    // E o caso de eu responder "!s" a uma midia da pessoa.
    const result = decidir({ remoteJid: `${AUTORIZADO}@s.whatsapp.net`, fromMe: true })
    assert.equal(result.allowed, true)
    assert.equal(result.allowed && result.kind, 'contact')
  })

  it('reconhece o contato que chega como lid, pelo campo alternativo', () => {
    const result = decidir({
      remoteJid: `${AUTORIZADO_LID}@lid`,
      remoteJidAlt: `${AUTORIZADO}@s.whatsapp.net`,
      fromMe: false
    })
    assert.equal(result.allowed, true)
    assert.equal(result.allowed && result.identity, AUTORIZADO)
    // A resposta vai para a conversa de onde veio, nao para o jid de numero.
    assert.equal(result.allowed && result.chatJid, `${AUTORIZADO_LID}@lid`)
  })

  it('reconhece o contato lid pelo cache, sem campo alternativo', () => {
    const cache = (lid: string): string | null => (lid === AUTORIZADO_LID ? AUTORIZADO : null)
    const result = decidir({ remoteJid: `${AUTORIZADO_LID}@lid`, fromMe: false }, cache)
    assert.equal(result.allowed, true)
    assert.equal(result.allowed && result.identity, AUTORIZADO)
  })

  it('rejeita numero fora da lista', () => {
    assert.equal(
      negado(decidir({ remoteJid: `${ESTRANHO}@s.whatsapp.net`, fromMe: false })),
      'not-authorized'
    )
  })

  it('rejeita lid de numero nao autorizado, mesmo resolvido', () => {
    const result = decidir({
      remoteJid: '999999999999999@lid',
      remoteJidAlt: `${ESTRANHO}@s.whatsapp.net`,
      fromMe: false
    })
    assert.equal(negado(result), 'not-authorized')
  })

  it('rejeita lid que nao da para resolver', () => {
    const result = decidir({ remoteJid: '999999999999999@lid', fromMe: false })
    assert.equal(negado(result), 'unresolved-identity')
  })

  it('nunca autoriza quando a lista esta vazia', () => {
    const result = authorize({
      key: { remoteJid: `${AUTORIZADO}@s.whatsapp.net`, fromMe: false },
      self: SELF,
      allowedNumbers: new Set()
    })
    assert.equal(negado(result), 'not-authorized')
  })
})

describe('resolveCounterpartPhone', () => {
  it('usa o proprio jid quando ja e numero', () => {
    assert.equal(
      resolveCounterpartPhone({ remoteJid: `${AUTORIZADO}:5@s.whatsapp.net` }),
      AUTORIZADO
    )
  })

  it('prefere o campo alternativo ao cache', () => {
    const cache = (): string => ESTRANHO
    assert.equal(
      resolveCounterpartPhone(
        { remoteJid: `${AUTORIZADO_LID}@lid`, remoteJidAlt: `${AUTORIZADO}@s.whatsapp.net` },
        cache
      ),
      AUTORIZADO
    )
  })

  it('devolve null quando nao ha como saber', () => {
    assert.equal(resolveCounterpartPhone({ remoteJid: '123@lid' }), null)
    assert.equal(resolveCounterpartPhone({ remoteJid: null }), null)
  })
})
