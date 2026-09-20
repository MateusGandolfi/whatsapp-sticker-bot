/**
 * Utilitarios de JID, escritos aqui em vez de reaproveitar os do Baileys por um
 * motivo de seguranca: `areJidsSameUser` do Baileys compara SOMENTE a parte do
 * usuario e ignora o servidor, entao ela considera `123@lid` igual a
 * `123@s.whatsapp.net`. Sao pessoas diferentes. Como este bot roda no numero
 * pessoal, a comparacao aqui e sensivel ao servidor.
 *
 * Modulo puro: nao importa nada em tempo de execucao, entao os testes rodam sem
 * carregar a biblioteca.
 */

export const PN_SERVER = 's.whatsapp.net'
export const LID_SERVER = 'lid'
export const GROUP_SERVER = 'g.us'
export const BROADCAST_SERVER = 'broadcast'
export const NEWSLETTER_SERVER = 'newsletter'
export const STATUS_BROADCAST = 'status@broadcast'

export interface ParsedJid {
  /** Parte do usuario, ja sem o sufixo `:device` e sem o sufixo `_agent`. */
  user: string
  /** Servidor canonico. `c.us` e convertido para `s.whatsapp.net`. */
  server: string
  /** Numero do dispositivo, quando o JID trazia `:device`. */
  device?: number
}

/** Mantem somente digitos. Serve para normalizar numeros vindos do .env. */
export function onlyDigits(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/\D+/g, '')
}

/**
 * Quebra um JID em usuario e servidor, seguindo o mesmo formato que o Baileys
 * gera: `usuario_agente:dispositivo@servidor`.
 */
export function parseJid(jid: string | null | undefined): ParsedJid | null {
  if (typeof jid !== 'string') return null

  const trimmed = jid.trim()
  const sepIdx = trimmed.indexOf('@')
  if (sepIdx <= 0) return null

  const rawServer = trimmed.slice(sepIdx + 1).toLowerCase()
  if (!rawServer) return null

  const userCombined = trimmed.slice(0, sepIdx)
  const [userAgent = '', deviceRaw] = userCombined.split(':')
  const [user = ''] = userAgent.split('_')
  if (!user) return null

  const server = rawServer === 'c.us' ? PN_SERVER : rawServer
  const device = deviceRaw !== undefined && deviceRaw !== '' ? Number(deviceRaw) : undefined

  return {
    user,
    server,
    ...(device !== undefined && Number.isFinite(device) ? { device } : {})
  }
}

/**
 * Devolve o JID em forma canonica `usuario@servidor`, sem `:device`.
 * Retorna null quando o JID e invalido, em vez de string vazia, para que um
 * valor ausente nunca case por acidente com outro valor ausente.
 */
export function normalizeJid(jid: string | null | undefined): string | null {
  const parsed = parseJid(jid)
  if (!parsed) return null
  return `${parsed.user}@${parsed.server}`
}

export function jidUser(jid: string | null | undefined): string | null {
  return parseJid(jid)?.user ?? null
}

export function jidServer(jid: string | null | undefined): string | null {
  return parseJid(jid)?.server ?? null
}

/**
 * Compara dois JIDs considerando usuario E servidor. E a diferenca central em
 * relacao ao `areJidsSameUser` do Baileys.
 */
export function isSameJid(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeJid(a)
  const right = normalizeJid(b)
  if (left === null || right === null) return false
  return left === right
}

export function isPnJid(jid: string | null | undefined): boolean {
  return jidServer(jid) === PN_SERVER
}

export function isLidJid(jid: string | null | undefined): boolean {
  return jidServer(jid) === LID_SERVER
}

export function isGroupJid(jid: string | null | undefined): boolean {
  return jidServer(jid) === GROUP_SERVER
}

export function isBroadcastJid(jid: string | null | undefined): boolean {
  return jidServer(jid) === BROADCAST_SERVER
}

export function isStatusBroadcastJid(jid: string | null | undefined): boolean {
  return normalizeJid(jid) === STATUS_BROADCAST
}

export function isNewsletterJid(jid: string | null | undefined): boolean {
  return jidServer(jid) === NEWSLETTER_SERVER
}

/** Conversa individual, seja ela identificada por numero ou por LID. */
export function isPrivateJid(jid: string | null | undefined): boolean {
  const server = jidServer(jid)
  return server === PN_SERVER || server === LID_SERVER
}

/**
 * Extrai o numero de telefone de um JID, em digitos. So funciona para JIDs de
 * numero: um `@lid` nao carrega o telefone e devolve null de proposito.
 */
export function phoneFromJid(jid: string | null | undefined): string | null {
  const parsed = parseJid(jid)
  if (!parsed || parsed.server !== PN_SERVER) return null
  const digits = onlyDigits(parsed.user)
  return digits.length > 0 ? digits : null
}

/** Monta um JID de numero a partir de digitos. */
export function pnJid(digits: string): string {
  return `${onlyDigits(digits)}@${PN_SERVER}`
}
