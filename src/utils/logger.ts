import pino from 'pino'

/**
 * Contrato de logger que o Baileys espera. A biblioteca nao reexporta esta
 * interface no indice do pacote, entao declaramos o mesmo formato aqui em vez
 * de importar de um caminho interno que pode mudar entre versoes.
 */
export interface ILogger {
  level: string
  child(obj: Record<string, unknown>): ILogger
  trace(obj: unknown, msg?: string): void
  debug(obj: unknown, msg?: string): void
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
}

/**
 * Logger unico da aplicacao. Sai formatado quando ha terminal, e em JSON puro
 * quando roda sob pm2 ou Docker, onde o agregador prefere JSON.
 */
export function createLogger(level: string): pino.Logger {
  const pretty = process.stdout.isTTY === true

  return pino({
    level,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' }
          }
        }
      : {})
  })
}

/**
 * A `ILogger` e um subconjunto estrutural do pino. A conversao e feita num
 * ponto so, para nao espalhar `any` pelo bootstrap.
 */
export function asBaileysLogger(logger: pino.Logger): ILogger {
  return logger as unknown as ILogger
}
