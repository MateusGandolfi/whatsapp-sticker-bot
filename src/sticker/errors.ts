/**
 * Erros que viram mensagem curta na conversa. Qualquer outro erro e tratado
 * como falha inesperada, com stack completo no log.
 */
export class StickerError extends Error {
  constructor(
    /** Texto curto enviado ao usuario. */
    public readonly userMessage: string,
    /** Detalhe tecnico que vai so para o log. */
    message?: string
  ) {
    super(message ?? userMessage)
    this.name = 'StickerError'
  }
}
