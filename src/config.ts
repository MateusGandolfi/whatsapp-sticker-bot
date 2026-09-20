import 'dotenv/config'
import { onlyDigits } from './utils/jid.js'
import { parseAllowedNumbers } from './handlers/authorization.js'

export type LoginMode = 'qr' | 'pairing'

export interface AppConfig {
  loginMode: LoginMode
  phoneNumber: string
  packName: string
  packAuthor: string
  allowedNumbers: ReadonlySet<string>
  maxVideoSeconds: number
  maxInputBytes: number
  commandPrefix: string
  rateLimitPerMin: number
  ffmpegPath: string
  ignoreOldMessages: boolean
  logLevel: string
}

function readString(name: string, fallback: string): string {
  const value = process.env[name]
  return value !== undefined && value.trim() !== '' ? value.trim() : fallback
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback

  const parsed = Number.parseInt(raw.trim(), 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} precisa ser um numero inteiro, recebi "${raw}"`)
  }
  if (parsed < min || parsed > max) {
    throw new Error(`${name} precisa estar entre ${min} e ${max}, recebi ${parsed}`)
  }
  return parsed
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  return ['1', 'true', 'yes', 'sim'].includes(raw.trim().toLowerCase())
}

/**
 * Le e valida o .env. Falha rapido na inicializacao: e melhor nao subir do que
 * subir com o modo pairing sem numero ou com um prefixo vazio que faria o bot
 * responder a qualquer texto.
 */
export function loadConfig(): AppConfig {
  const loginModeRaw = readString('LOGIN_MODE', 'qr').toLowerCase()
  if (loginModeRaw !== 'qr' && loginModeRaw !== 'pairing') {
    throw new Error(`LOGIN_MODE precisa ser "qr" ou "pairing", recebi "${loginModeRaw}"`)
  }

  const phoneNumber = onlyDigits(process.env['PHONE_NUMBER'])
  if (loginModeRaw === 'pairing' && phoneNumber.length < 10) {
    throw new Error(
      'LOGIN_MODE=pairing exige PHONE_NUMBER no formato internacional sem "+", ex.: 5517999999999'
    )
  }

  const commandPrefix = readString('COMMAND_PREFIX', '!')
  if (commandPrefix.length === 0 || /\s/.test(commandPrefix)) {
    throw new Error('COMMAND_PREFIX nao pode ser vazio nem conter espacos')
  }

  return {
    loginMode: loginModeRaw,
    phoneNumber,
    packName: readString('PACK_NAME', 'Minhas Figurinhas'),
    packAuthor: readString('PACK_AUTHOR', 'Bot'),
    allowedNumbers: parseAllowedNumbers(process.env['ALLOWED_NUMBERS']),
    maxVideoSeconds: readInt('MAX_VIDEO_SECONDS', 8, 1, 15),
    maxInputBytes: readInt('MAX_INPUT_MB', 20, 1, 100) * 1024 * 1024,
    commandPrefix,
    rateLimitPerMin: readInt('RATE_LIMIT_PER_MIN', 10, 1, 240),
    ffmpegPath: readString('FFMPEG_PATH', 'ffmpeg'),
    ignoreOldMessages: readBool('IGNORE_OLD_MESSAGES', true),
    logLevel: readString('LOG_LEVEL', 'info')
  }
}
