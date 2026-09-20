import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

/**
 * Pasta temporaria para o ffmpeg, que precisa de entrada seekable e nao aceita
 * MP4 vindo de pipe.
 */
export class TempDir {
  constructor(private readonly root: string) {}

  async ensure(): Promise<void> {
    await mkdir(this.root, { recursive: true })
  }

  /** Remove sobras de execucoes anteriores, por exemplo depois de um crash. */
  async cleanStale(): Promise<void> {
    try {
      const entries = await readdir(this.root)
      await Promise.all(
        entries.map(entry => rm(join(this.root, entry), { force: true, recursive: true }))
      )
    } catch {
      // Uma limpeza que falha nao justifica impedir a inicializacao.
    }
  }

  path(extension: string): string {
    const suffix = extension.startsWith('.') ? extension : `.${extension}`
    return join(this.root, `${randomUUID()}${suffix}`)
  }

  async writeTemp(buffer: Buffer, extension: string): Promise<string> {
    const filePath = this.path(extension)
    await writeFile(filePath, buffer)
    return filePath
  }

  /** Nunca lanca: e sempre chamada dentro de um `finally`. */
  async remove(...paths: Array<string | null | undefined>): Promise<void> {
    await Promise.all(
      paths
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .map(path => rm(path, { force: true }).catch(() => undefined))
    )
  }
}
