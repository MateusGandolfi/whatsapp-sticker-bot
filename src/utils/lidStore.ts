import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Logger } from 'pino'
import { isLidJid, jidUser, onlyDigits, phoneFromJid } from './jid.js'

/**
 * Cache em disco do mapeamento LID -> numero de telefone.
 *
 * O Baileys so consegue resolver um LID que ja viu passar. Sem este cache, um
 * contato autorizado que se apresenta como `@lid` deixaria de ser reconhecido
 * toda vez que o processo reiniciasse. O arquivo guarda apenas o par
 * LID/numero, nunca conteudo de mensagem.
 */
export class LidStore {
  private map = new Map<string, string>()
  private dirty = false
  private saving: Promise<void> | null = null

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger
  ) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed: unknown = JSON.parse(raw)

      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [lid, phone] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof phone === 'string') {
            const digits = onlyDigits(phone)
            if (digits) this.map.set(lid, digits)
          }
        }
      }
      this.logger.info({ entries: this.map.size }, 'cache LID carregado')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        this.logger.debug('cache LID ainda nao existe, comecando vazio')
        return
      }
      // Um cache corrompido nao pode derrubar o bot: a autorizacao continua
      // funcionando pelos campos alternativos da propria mensagem.
      this.logger.warn({ err: error }, 'nao consegui ler o cache LID, comecando vazio')
    }
  }

  /** Consulta sincrona, usada pela funcao pura de autorizacao. */
  lookup = (lidUser: string): string | null => {
    return this.map.get(lidUser) ?? null
  }

  /**
   * Grava um par. Aceita JIDs completos ou so a parte do usuario.
   *
   * Um JID que nao seja `@lid` e recusado: a agenda tambem traz contatos
   * identificados por numero, e guardar esses poluiria o cache com chaves que
   * nunca serao consultadas.
   */
  remember(lid: string | null | undefined, pn: string | null | undefined): void {
    if (typeof lid === 'string' && lid.includes('@') && !isLidJid(lid)) return

    const lidKey = jidUser(lid) ?? (lid ? onlyDigits(lid) : '')
    const phone = phoneFromJid(pn) ?? onlyDigits(pn)

    if (!lidKey || !phone) return
    if (this.map.get(lidKey) === phone) return

    this.map.set(lidKey, phone)
    this.dirty = true
    this.logger.debug({ lid: lidKey }, 'novo mapeamento LID aprendido')
    void this.flush()
  }

  /**
   * Garante que tudo que esta em memoria chegou ao disco.
   *
   * Se ja houver uma gravacao em andamento, espera por ela antes de decidir se
   * precisa gravar de novo. Sem essa espera, um `flush` chamado logo depois de
   * um `remember` voltaria antes de o arquivo existir, e o encerramento poderia
   * perder o ultimo mapeamento aprendido.
   */
  async flush(): Promise<void> {
    if (this.saving !== null) await this.saving
    if (!this.dirty) return

    this.dirty = false
    const job = this.write()
    this.saving = job

    try {
      await job
    } finally {
      if (this.saving === job) this.saving = null
    }
  }

  /**
   * Escrita atomica: grava num arquivo temporario e renomeia, para que uma
   * queda no meio da escrita nao deixe um JSON pela metade.
   *
   * Nunca lanca. Uma falha ao gravar o cache nao pode derrubar o bot, entao ela
   * vira aviso no log e marca o estado como pendente de nova tentativa.
   */
  private async write(): Promise<void> {
    const payload = JSON.stringify(Object.fromEntries(this.map), null, 2)
    const tempPath = `${this.filePath}.tmp`

    try {
      await mkdir(dirname(this.filePath), { recursive: true })
      await writeFile(tempPath, payload, 'utf8')
      await rename(tempPath, this.filePath)
    } catch (error) {
      this.dirty = true
      this.logger.warn({ err: error }, 'nao consegui gravar o cache LID')
    }
  }
}
