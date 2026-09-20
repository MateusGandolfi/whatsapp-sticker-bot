import { join } from 'node:path'
import qrcode from 'qrcode-terminal'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from '@whiskeysockets/baileys'
import type { Contact, WASocket } from '@whiskeysockets/baileys'
import { loadConfig } from './config.js'
import { buildSelfIdentity, type SelfIdentity } from './handlers/authorization.js'
import { createMessageHandler } from './handlers/messageHandler.js'
import { asBaileysLogger, createLogger } from './utils/logger.js'
import { isBroadcastJid, isGroupJid, isNewsletterJid } from './utils/jid.js'
import { LidStore } from './utils/lidStore.js'
import { RateLimiter } from './utils/rateLimiter.js'
import { RecentIds } from './utils/recentIds.js'
import { SerialQueue } from './utils/queue.js'
import { TempDir } from './utils/tempFiles.js'

const AUTH_DIR = join(process.cwd(), 'auth')
const DATA_FILE = join(process.cwd(), 'data', 'lid-map.json')
const TEMP_DIR = join(process.cwd(), 'tmp')

const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000

/** Le `statusCode` de um erro do Boom sem depender do pacote @hapi/boom. */
function statusCodeOf(error: unknown): number | undefined {
  const output = (error as { output?: { statusCode?: unknown } } | null | undefined)?.output
  return typeof output?.statusCode === 'number' ? output.statusCode : undefined
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  const config = loadConfig()
  const logger = createLogger(config.logLevel)

  logger.info(
    {
      modoLogin: config.loginMode,
      contatosAutorizados: config.allowedNumbers.size,
      prefixo: config.commandPrefix
    },
    'iniciando bot de figurinhas'
  )

  const tempDir = new TempDir(TEMP_DIR)
  await tempDir.ensure()
  await tempDir.cleanStale()

  const lidStore = new LidStore(DATA_FILE, logger)
  await lidStore.load()

  const rateLimiter = new RateLimiter(config.rateLimitPerMin)
  const queue = new SerialQueue(5)
  const sentIds = new RecentIds(200)
  const startedAt = Math.floor(Date.now() / 1000)

  // Objeto mutavel: a identidade so e conhecida depois que a conexao abre, e o
  // handler guarda esta mesma referencia.
  const self: SelfIdentity = { pn: null, lid: null }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()
  logger.info({ versaoWhatsApp: version.join('.') }, 'versao do protocolo')

  const pruneTimer = setInterval(() => rateLimiter.prune(), 5 * 60_000)
  pruneTimer.unref()

  let reconnectAttempt = 0
  let shuttingDown = false
  let current: WASocket | null = null

  function connect(): void {
    const sock = makeWASocket({
      version,
      logger: asBaileysLogger(logger),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, asBaileysLogger(logger))
      },
      // Perfil discreto: nao aparecer online, nao puxar historico e nao gerar
      // previews, que sao requisicoes extras desnecessarias aqui.
      markOnlineOnConnect: false,
      // Historico completo fica desligado, entao o WhatsApp manda so o
      // recente. Nao vale desligar o sync por inteiro com
      // `shouldSyncHistoryMessage`: o proprio Baileys avisa que isso corta o
      // acesso aos mapeamentos LID iniciais, que sao justamente o que faz o
      // reconhecimento dos contatos autorizados funcionar.
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      // Defesa em profundidade: grupos, listas e canais sao descartados antes
      // mesmo de serem decifrados. O handler checa de novo mais adiante.
      shouldIgnoreJid: jid => isGroupJid(jid) || isBroadcastJid(jid) || isNewsletterJid(jid),
      // Identificador aceito pelo fluxo de pairing code.
      browser: Browsers.ubuntu('Chrome')
    })

    current = sock

    sock.ev.on('creds.update', () => {
      void saveCreds()
    })

    sock.ev.on('lid-mapping.update', mapping => {
      lidStore.remember(mapping.lid, mapping.pn)
    })

    // A agenda sincronizada tambem carrega o par LID/numero. Aproveitar isso
    // faz o bot reconhecer um contato autorizado ja no primeiro comando, sem
    // depender de ele mandar uma mensagem antes.
    function learnContacts(contacts: Array<Partial<Contact>>): void {
      for (const contact of contacts) {
        if (contact.phoneNumber) {
          lidStore.remember(contact.lid ?? contact.id, contact.phoneNumber)
        }
      }
    }

    sock.ev.on('contacts.upsert', learnContacts)
    sock.ev.on('contacts.update', learnContacts)
    sock.ev.on('messaging-history.set', ({ contacts }) => learnContacts(contacts))

    const handleUpsert = createMessageHandler({
      sock,
      config,
      logger,
      lidStore,
      rateLimiter,
      queue,
      sentIds,
      tempDir,
      startedAt,
      self
    })

    sock.ev.on('messages.upsert', upsert => {
      void handleUpsert(upsert)
    })

    sock.ev.on('connection.update', update => {
      const { connection, lastDisconnect, qr } = update

      if (qr && config.loginMode === 'qr') {
        logger.info('escaneie o QR code abaixo em Aparelhos conectados')
        qrcode.generate(qr, { small: true })
      }

      if (connection === 'open') {
        reconnectAttempt = 0
        const identity = buildSelfIdentity(sock.user)
        self.pn = identity.pn
        self.lid = identity.lid
        logger.info({ pn: self.pn, lid: self.lid }, 'conectado')
      }

      if (connection === 'close') {
        const code = statusCodeOf(lastDisconnect?.error)

        if (code === DisconnectReason.loggedOut) {
          logger.error(
            'sessao encerrada no celular. Apague a pasta ./auth e faca login de novo.'
          )
          void shutdown(1)
          return
        }

        if (shuttingDown) return

        reconnectAttempt += 1
        const wait = Math.min(RECONNECT_MIN_MS * 2 ** (reconnectAttempt - 1), RECONNECT_MAX_MS)
        logger.warn({ code, tentativa: reconnectAttempt, emMs: wait }, 'conexao caiu, reconectando')

        setTimeout(() => {
          if (!shuttingDown) connect()
        }, wait)
      }
    })

    // Pairing code so faz sentido antes do primeiro registro.
    if (config.loginMode === 'pairing' && !state.creds.registered) {
      void (async () => {
        try {
          // Uma pausa curta: o socket precisa estar pronto antes do pedido.
          await delay(4_000)
          const code = await sock.requestPairingCode(config.phoneNumber)
          logger.info(
            { codigo: code },
            'no celular abra Aparelhos conectados, Conectar com numero de telefone, e digite este codigo'
          )
        } catch (error) {
          logger.error({ err: error }, 'falha ao pedir o pairing code')
        }
      })()
    }
  }

  async function shutdown(exitCode: number): Promise<void> {
    if (shuttingDown) return
    shuttingDown = true

    clearInterval(pruneTimer)
    await lidStore.flush()
    await tempDir.cleanStale()

    try {
      current?.ws.close()
    } catch {
      // Fechar um socket ja morto nao e problema.
    }

    logger.info('encerrado')
    process.exit(exitCode)
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      logger.info({ signal }, 'sinal recebido, encerrando')
      void shutdown(0)
    })
  }

  connect()
}

main().catch((error: unknown) => {
  console.error('falha na inicializacao:', error)
  process.exit(1)
})
