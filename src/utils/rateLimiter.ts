/**
 * Limite por identidade numa janela deslizante de 60 segundos.
 *
 * Vale para todo mundo, inclusive o self-chat, que foi a escolha feita na
 * configuracao. Ao exceder, o chamador ignora em silencio: responder "calma la"
 * a cada excesso so aumentaria o volume de mensagens.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly limitPerMinute: number,
    private readonly windowMs: number = 60_000
  ) {}

  /** Registra um uso e diz se ele cabe no limite. */
  tryConsume(identity: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs
    const recent = (this.hits.get(identity) ?? []).filter(timestamp => timestamp > cutoff)

    if (recent.length >= this.limitPerMinute) {
      this.hits.set(identity, recent)
      return false
    }

    recent.push(now)
    this.hits.set(identity, recent)
    return true
  }

  /** Remove identidades inativas para a memoria nao crescer sem limite. */
  prune(now: number = Date.now()): void {
    const cutoff = now - this.windowMs
    for (const [identity, timestamps] of this.hits) {
      const recent = timestamps.filter(timestamp => timestamp > cutoff)
      if (recent.length === 0) this.hits.delete(identity)
      else this.hits.set(identity, recent)
    }
  }
}
