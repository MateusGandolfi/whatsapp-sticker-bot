/**
 * `node-webpmux` e CommonJS e nao publica tipos. Declaramos apenas o que este
 * projeto usa, em vez de recorrer a `any`.
 *
 * Os exports nomeados nao sao detectaveis estaticamente a partir de ESM, entao
 * o modulo e declarado com export default e desestruturado em tempo de execucao.
 */
declare module 'node-webpmux' {
  class Image {
    static from(webp: Buffer): Promise<Image>
    load(data: Buffer): Promise<void>
    save(path: null): Promise<Buffer>
    save(path: string): Promise<void>
    exif: Buffer | undefined
    readonly width: number
    readonly height: number
    readonly hasAnim: boolean
  }

  const webpmux: { Image: typeof Image }
  export default webpmux
  export { Image }
}
