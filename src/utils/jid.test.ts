import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isGroupJid,
  isLidJid,
  isNewsletterJid,
  isPnJid,
  isPrivateJid,
  isSameJid,
  isStatusBroadcastJid,
  normalizeJid,
  onlyDigits,
  parseJid,
  phoneFromJid,
  pnJid
} from './jid.js'

describe('parseJid', () => {
  it('separa usuario e servidor', () => {
    assert.deepEqual(parseJid('5517999999999@s.whatsapp.net'), {
      user: '5517999999999',
      server: 's.whatsapp.net'
    })
  })

  it('remove o sufixo :device', () => {
    const parsed = parseJid('5517999999999:12@s.whatsapp.net')
    assert.equal(parsed?.user, '5517999999999')
    assert.equal(parsed?.device, 12)
  })

  it('remove o sufixo _agent', () => {
    assert.equal(parseJid('5517999999999_1:3@s.whatsapp.net')?.user, '5517999999999')
  })

  it('converte c.us para s.whatsapp.net', () => {
    assert.equal(parseJid('5517999999999@c.us')?.server, 's.whatsapp.net')
  })

  it('preserva o servidor lid', () => {
    assert.equal(parseJid('123456789@lid')?.server, 'lid')
  })

  it('devolve null para entrada invalida', () => {
    for (const invalid of [null, undefined, '', 'sem-arroba', '@s.whatsapp.net']) {
      assert.equal(parseJid(invalid), null)
    }
  })
})

describe('normalizeJid', () => {
  it('produz a forma canonica sem dispositivo', () => {
    assert.equal(normalizeJid('5517999999999:8@c.us'), '5517999999999@s.whatsapp.net')
  })

  it('devolve null em vez de string vazia quando invalido', () => {
    assert.equal(normalizeJid('lixo'), null)
  })
})

describe('isSameJid', () => {
  it('ignora o dispositivo ao comparar', () => {
    assert.equal(
      isSameJid('5517999999999:3@s.whatsapp.net', '5517999999999@s.whatsapp.net'),
      true
    )
  })

  it('NAO casa numeros iguais em servidores diferentes', () => {
    // Este e o caso que o areJidsSameUser do Baileys erra: ele compara so a
    // parte do usuario e diria que sao a mesma pessoa.
    assert.equal(isSameJid('123456789@lid', '123456789@s.whatsapp.net'), false)
  })

  it('nao considera dois valores ausentes como iguais', () => {
    assert.equal(isSameJid(null, null), false)
    assert.equal(isSameJid(undefined, 'lixo'), false)
  })
})

describe('classificacao de servidor', () => {
  it('reconhece cada tipo de conversa', () => {
    assert.equal(isPnJid('5517999999999@s.whatsapp.net'), true)
    assert.equal(isLidJid('123@lid'), true)
    assert.equal(isGroupJid('120363000000000000@g.us'), true)
    assert.equal(isNewsletterJid('120363000000000000@newsletter'), true)
    assert.equal(isStatusBroadcastJid('status@broadcast'), true)
  })

  it('so trata numero e lid como conversa individual', () => {
    assert.equal(isPrivateJid('5517999999999@s.whatsapp.net'), true)
    assert.equal(isPrivateJid('123@lid'), true)
    assert.equal(isPrivateJid('120363000000000000@g.us'), false)
    assert.equal(isPrivateJid('status@broadcast'), false)
  })
})

describe('phoneFromJid', () => {
  it('extrai os digitos de um jid de numero', () => {
    assert.equal(phoneFromJid('5517999999999:2@s.whatsapp.net'), '5517999999999')
  })

  it('devolve null para lid, porque o lid nao carrega o telefone', () => {
    assert.equal(phoneFromJid('123456789@lid'), null)
  })
})

describe('helpers', () => {
  it('onlyDigits limpa a formatacao', () => {
    assert.equal(onlyDigits('+55 (17) 99999-9999'), '5517999999999')
    assert.equal(onlyDigits(undefined), '')
  })

  it('pnJid monta o jid de numero', () => {
    assert.equal(pnJid('+5517999999999'), '5517999999999@s.whatsapp.net')
  })
})
