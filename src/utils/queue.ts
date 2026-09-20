/**
 * Fila serial. Processa uma conversao por vez para nao gerar rajada de envios,
 * que e justamente o padrao que chama atencao numa conta pessoal.
 *
 * Quando a espera passa do limite, o pedido e recusado em vez de acumular: e
 * melhor avisar que esta ocupado do que responder tres minutos depois.
 */
export class SerialQueue {
  private chain: Promise<unknown> = Promise.resolve()
  private waiting = 0

  constructor(private readonly maxWaiting: number = 5) {}

  get pending(): number {
    return this.waiting
  }

  /** Retorna null quando a fila esta cheia. */
  run<T>(task: () => Promise<T>): Promise<T> | null {
    if (this.waiting >= this.maxWaiting) return null

    this.waiting += 1
    const result = this.chain.then(task, task)

    // A corrente continua mesmo se a tarefa falhar, senao uma conversao com
    // erro travaria todas as proximas.
    this.chain = result.then(
      () => undefined,
      () => undefined
    )
    void this.chain.then(() => {
      this.waiting -= 1
    })

    return result
  }
}
