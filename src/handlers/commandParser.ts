/**
 * Parser de comandos. Modulo puro, sem dependencias em tempo de execucao.
 *
 * Regra de seguranca que vale mais que o resto: qualquer texto que nao comece
 * com um comando conhecido devolve null. Conversa normal nunca aciona o bot.
 */

export type StickerMode = 'fit' | 'crop'

export type ParsedCommand =
  | { kind: 'sticker'; mode: StickerMode }
  | { kind: 'help' }

/**
 * Interpreta o texto de uma mensagem.
 *
 * O comando precisa ser o primeiro token, e case-insensitive e tolera espacos
 * em volta. Texto depois do comando e ignorado.
 *
 * @param text   legenda da midia ou corpo da mensagem
 * @param prefix prefixo configurado, normalmente "!"
 */
export function parseCommand(
  text: string | null | undefined,
  prefix: string
): ParsedCommand | null {
  if (typeof text !== 'string' || prefix.length === 0) return null

  const trimmed = text.trim()
  if (!trimmed.startsWith(prefix)) return null

  const withoutPrefix = trimmed.slice(prefix.length)
  const firstToken = withoutPrefix.split(/\s+/, 1)[0]
  if (!firstToken) return null

  switch (firstToken.toLowerCase()) {
    case 's':
      return { kind: 'sticker', mode: 'fit' }
    case 'sc':
      return { kind: 'sticker', mode: 'crop' }
    case 'help':
      return { kind: 'help' }
    default:
      return null
  }
}

/** Texto de ajuda, montado com o prefixo em uso. */
export function helpText(prefix: string): string {
  return [
    '*Bot de figurinhas*',
    '',
    `${prefix}s   - figurinha mantendo a proporcao, com fundo transparente nas sobras`,
    `${prefix}sc  - figurinha cortando o centro para preencher o quadrado`,
    `${prefix}help - esta mensagem`,
    '',
    'Use o comando na legenda da imagem, GIF ou video, ou responda a uma midia com o comando.'
  ].join('\n')
}
