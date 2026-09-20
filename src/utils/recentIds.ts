/**
 * Conjunto limitado dos ids das mensagens que o bot enviou.
 *
 * E a trava anti-loop: uma figurinha enviada pelo bot chega de volta como
 * mensagem com `fromMe: true` no self-chat, e sem isso o bot poderia reagir a
 * si mesmo. Guarda os mais recentes e descarta os antigos.
 */
export class RecentIds {
  private readonly ids = new Set<string>()
  private readonly order: string[] = []

  constructor(private readonly capacity: number = 200) {}

  add(id: string | null | undefined): void {
    if (!id || this.ids.has(id)) return

    this.ids.add(id)
    this.order.push(id)

    while (this.order.length > this.capacity) {
      const oldest = this.order.shift()
      if (oldest !== undefined) this.ids.delete(oldest)
    }
  }

  has(id: string | null | undefined): boolean {
    return typeof id === 'string' && this.ids.has(id)
  }
}
