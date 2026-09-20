/**
 * Filtro de autorizacao. Este e o modulo mais importante do projeto: nenhuma
 * midia e baixada e nenhuma mensagem e enviada antes de passar por aqui.
 *
 * E uma funcao pura de proposito. Ela nao faz rede, nao le disco e nao consulta
 * o socket, entao pode ser testada exaustivamente. Tudo que ela precisa saber
 * chega por parametro, inclusive a resolucao de LID, que o chamador ja fez de
 * forma assincrona antes.
 *
 * As importacoes sao `import type`, que somem na compilacao. Nenhum teste
 * carrega o Baileys.
 */

import type { WAMessageKey } from '@whiskeysockets/baileys'
import {
  isBroadcastJid,
  isGroupJid,
  isLidJid,
  isNewsletterJid,
  isPrivateJid,
  isSameJid,
  isStatusBroadcastJid,
  jidUser,
  normalizeJid,
  onlyDigits,
  phoneFromJid
} from '../utils/jid.js'

/** Minha identidade nos dois formatos, ja normalizada e sem `:device`. */
export interface SelfIdentity {
  /** Meu JID de numero, ex.: `5517999999999@s.whatsapp.net`. */
  pn: string | null
  /** Meu JID de LID, ex.: `123456789@lid`. */
  lid: string | null
}

/** Consulta sincrona ao cache LID -> numero ja carregado em memoria. */
export type LidResolver = (lidUser: string) => string | null | undefined

export type DenyReason =
  | 'no-remote-jid'
  | 'group'
  | 'status-broadcast'
  | 'broadcast'
  | 'newsletter'
  | 'unsupported-chat'
  | 'self-chat-not-from-me'
  | 'unresolved-identity'
  | 'not-authorized'

export type AuthorizeResult =
  | {
      allowed: true
      /** `self` = minha conversa comigo. `contact` = 1:1 com numero autorizado. */
      kind: 'self' | 'contact'
      /** Conversa onde a resposta deve ser enviada. Nunca monte outro JID. */
      chatJid: string
      /** Chave estavel usada pelo rate limit. */
      identity: string
    }
  | { allowed: false; reason: DenyReason }

/** Subconjunto da chave que a autorizacao realmente usa. */
export type AuthorizableKey = Pick<
  WAMessageKey,
  'remoteJid' | 'fromMe' | 'participant' | 'remoteJidAlt' | 'participantAlt'
>

export interface AuthorizeInput {
  key: AuthorizableKey
  self: SelfIdentity
  /** Numeros autorizados em digitos puros, ex.: `5517999999999`. */
  allowedNumbers: ReadonlySet<string>
  lidToPhone?: LidResolver
}

/**
 * Monta a identidade propria a partir de `sock.user`.
 * `id` vem como `numero:dispositivo@s.whatsapp.net`, por isso a normalizacao.
 */
export function buildSelfIdentity(user: { id?: string; lid?: string } | undefined): SelfIdentity {
  return {
    pn: normalizeJid(user?.id),
    lid: normalizeJid(user?.lid)
  }
}

/** Converte a string do .env numa lista de numeros em digitos. */
export function parseAllowedNumbers(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  const numbers = raw
    .split(',')
    .map(entry => onlyDigits(entry))
    .filter(entry => entry.length >= 8)
  return new Set(numbers)
}

/**
 * Descobre o numero de telefone do outro lado de uma conversa 1:1.
 *
 * A cascata para quando acha: JID ja em formato de numero, depois o campo
 * alternativo que o Baileys 7 preenche quando conhece o par, depois o cache em
 * disco alimentado pelo evento `lid-mapping.update`.
 */
export function resolveCounterpartPhone(
  key: AuthorizableKey,
  lidToPhone?: LidResolver
): string | null {
  const direct = phoneFromJid(key.remoteJid)
  if (direct) return direct

  if (!isLidJid(key.remoteJid)) return null

  const fromAlt = phoneFromJid(key.remoteJidAlt)
  if (fromAlt) return fromAlt

  const lidUser = jidUser(key.remoteJid)
  if (!lidUser) return null

  const cached = onlyDigits(lidToPhone?.(lidUser) ?? '')
  return cached.length > 0 ? cached : null
}

/**
 * Decide se uma mensagem pode ser processada.
 *
 * A ordem das regras importa: as conversas proibidas sao rejeitadas antes de
 * qualquer tentativa de identificar quem falou.
 */
export function authorize(input: AuthorizeInput): AuthorizeResult {
  const { key, self, allowedNumbers, lidToPhone } = input
  const remoteJid = key.remoteJid

  if (!remoteJid) return { allowed: false, reason: 'no-remote-jid' }

  // Conversas onde o bot nunca fala, checadas primeiro. Um contato autorizado
  // dentro de um grupo continua sendo um grupo.
  if (isStatusBroadcastJid(remoteJid)) return { allowed: false, reason: 'status-broadcast' }
  if (isGroupJid(remoteJid)) return { allowed: false, reason: 'group' }
  if (isNewsletterJid(remoteJid)) return { allowed: false, reason: 'newsletter' }
  if (isBroadcastJid(remoteJid)) return { allowed: false, reason: 'broadcast' }
  if (!isPrivateJid(remoteJid)) return { allowed: false, reason: 'unsupported-chat' }

  const chatJid = normalizeJid(remoteJid)
  if (!chatJid) return { allowed: false, reason: 'no-remote-jid' }

  // Self-chat: a conversa e comigo mesmo, nos dois formatos possiveis.
  const isSelfChat =
    (self.pn !== null && isSameJid(chatJid, self.pn)) ||
    (self.lid !== null && isSameJid(chatJid, self.lid))

  if (isSelfChat) {
    // No self-chat toda mensagem legitima e minha. `fromMe` falso aqui e
    // anomalia, entao e descartado.
    if (key.fromMe !== true) return { allowed: false, reason: 'self-chat-not-from-me' }
    return { allowed: true, kind: 'self', chatJid, identity: chatJid }
  }

  // Conversa 1:1 com outra pessoa. Vale nas duas direcoes, porque em 1:1 o
  // `remoteJid` e sempre a outra pessoa, tanto faz quem enviou.
  const phone = resolveCounterpartPhone(key, lidToPhone)
  if (!phone) return { allowed: false, reason: 'unresolved-identity' }
  if (!allowedNumbers.has(phone)) return { allowed: false, reason: 'not-authorized' }

  return { allowed: true, kind: 'contact', chatJid, identity: phone }
}
