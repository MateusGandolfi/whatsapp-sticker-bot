import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { helpText, parseCommand } from './commandParser.js'

const PREFIX = '!'

describe('parseCommand', () => {
  it('reconhece !s como modo fit', () => {
    assert.deepEqual(parseCommand('!s', PREFIX), { kind: 'sticker', mode: 'fit' })
  })

  it('reconhece !sc como modo crop', () => {
    assert.deepEqual(parseCommand('!sc', PREFIX), { kind: 'sticker', mode: 'crop' })
  })

  it('reconhece !help', () => {
    assert.deepEqual(parseCommand('!help', PREFIX), { kind: 'help' })
  })

  it('ignora maiusculas e minusculas', () => {
    assert.deepEqual(parseCommand('!S', PREFIX), { kind: 'sticker', mode: 'fit' })
    assert.deepEqual(parseCommand('!Sc', PREFIX), { kind: 'sticker', mode: 'crop' })
  })

  it('tolera espacos em volta', () => {
    assert.deepEqual(parseCommand('  !s  ', PREFIX), { kind: 'sticker', mode: 'fit' })
  })

  it('aceita texto depois do comando e o ignora', () => {
    assert.deepEqual(parseCommand('!s legenda qualquer', PREFIX), {
      kind: 'sticker',
      mode: 'fit'
    })
  })

  it('aceita prefixo alternativo', () => {
    assert.deepEqual(parseCommand('/sc', '/'), { kind: 'sticker', mode: 'crop' })
    assert.equal(parseCommand('!sc', '/'), null)
  })

  it('devolve null para comando desconhecido', () => {
    assert.equal(parseCommand('!x', PREFIX), null)
    assert.equal(parseCommand('!sticker', PREFIX), null)
    assert.equal(parseCommand('!scc', PREFIX), null)
  })

  it('NAO dispara em conversa normal', () => {
    // A regra que mais importa: sem comando explicito o bot fica quieto.
    for (const texto of ['oi', 'manda um s ai', 'olha isso!', 's', '', '   ']) {
      assert.equal(parseCommand(texto, PREFIX), null, `disparou em: "${texto}"`)
    }
  })

  it('nao quebra com entrada ausente', () => {
    assert.equal(parseCommand(null, PREFIX), null)
    assert.equal(parseCommand(undefined, PREFIX), null)
  })

  it('o comando precisa ser o primeiro token', () => {
    assert.equal(parseCommand('olha !s', PREFIX), null)
  })
})

describe('helpText', () => {
  it('usa o prefixo configurado', () => {
    const texto = helpText('/')
    assert.ok(texto.includes('/s'))
    assert.ok(texto.includes('/sc'))
    assert.ok(!texto.includes('!s'))
  })
})
