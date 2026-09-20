import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { Logger } from 'pino'
import { LidStore } from './lidStore.js'

/** Logger mudo: os testes nao precisam de saida. */
const silent = {
  info: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
  error: () => undefined
} as unknown as Logger

let dir: string

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lidstore-'))
})

after(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('LidStore', () => {
  it('comeca vazio quando o arquivo nao existe', async () => {
    const store = new LidStore(join(dir, 'ausente.json'), silent)
    await store.load()
    assert.equal(store.lookup('123456789'), null)
  })

  it('guarda e consulta um par lid/numero', async () => {
    const store = new LidStore(join(dir, 'basico.json'), silent)
    await store.load()
    store.remember('222222222222222@lid', '5517922222222@s.whatsapp.net')
    assert.equal(store.lookup('222222222222222'), '5517922222222')
  })

  it('sobrevive ao reinicio, lendo do disco', async () => {
    const file = join(dir, 'persistencia.json')

    const primeiro = new LidStore(file, silent)
    await primeiro.load()
    primeiro.remember('333333333333333@lid', '5517933333333@s.whatsapp.net')
    await primeiro.flush()

    // Uma instancia nova simula o processo reiniciado.
    const segundo = new LidStore(file, silent)
    await segundo.load()
    assert.equal(segundo.lookup('333333333333333'), '5517933333333')
  })

  it('recusa chave que nao e lid', async () => {
    const store = new LidStore(join(dir, 'recusa.json'), silent)
    await store.load()
    store.remember('5517944444444@s.whatsapp.net', '5517944444444@s.whatsapp.net')
    assert.equal(store.lookup('5517944444444'), null)
  })

  it('ignora par incompleto', async () => {
    const store = new LidStore(join(dir, 'incompleto.json'), silent)
    await store.load()
    store.remember('555555555555555@lid', null)
    store.remember(null, '5517955555555@s.whatsapp.net')
    assert.equal(store.lookup('555555555555555'), null)
  })
})
