# Bot pessoal de figurinhas para WhatsApp

Converte imagem, GIF e vídeo em figurinha do WhatsApp. Roda conectado ao seu próprio
número e responde apenas na conversa "Mensagem para mim mesmo" e em conversas
individuais com contatos que você autorizar.

Você manda a mídia com a legenda `!s` e recebe a figurinha de volta, citando a
mensagem original.

## Aviso antes de começar

Este bot usa a biblioteca [Baileys](https://github.com/WhiskeySockets/Baileys), que não
é oficial e não é aprovada pela Meta. Automatizar uma conta pessoal implica risco de
bloqueio. O projeto foi escrito para reduzir esse risco: o bot não fica online, não
marca mensagens como lidas, não sincroniza histórico, processa uma conversão por vez e
só responde a comandos explícitos. Ainda assim, o risco existe e é seu.

A pasta `auth/` guarda a sessão do WhatsApp e dá acesso completo à sua conta. Ela já
está no `.gitignore`. Nunca versione, nunca compartilhe, nunca copie para outra máquina
sem necessidade.

## Requisitos

- Node.js 20 ou superior
- ffmpeg no PATH
- Um celular com WhatsApp para fazer o login

### Instalando o ffmpeg

**Windows**, escolha uma das opções, em um terminal como administrador:

```powershell
choco install ffmpeg
```

```powershell
winget install Gyan.FFmpeg
```

Também dá para baixar o pacote em https://www.gyan.dev/ffmpeg/builds/, extrair em
`C:\ffmpeg` e adicionar `C:\ffmpeg\bin` à variável de ambiente PATH.

**Linux (Debian e Ubuntu):**

```bash
sudo apt update && sudo apt install -y ffmpeg
```

**Confira se funcionou**, em qualquer sistema:

```bash
ffmpeg -version
```

Se o comando não for encontrado mesmo depois da instalação, aponte o caminho completo no
`.env`, na variável `FFMPEG_PATH`.

## Instalação

```bash
npm install
cp .env.example .env
```

No Windows, use `copy .env.example .env`.

Abra o `.env` e ajuste pelo menos `PACK_NAME` e `PACK_AUTHOR`.

## Login

O bot oferece dois modos, escolhidos em `LOGIN_MODE`.

### Modo QR code

É o padrão, e o mais simples quando você tem um terminal à vista.

```bash
npm run dev
```

Um QR code aparece no terminal. No celular, abra o WhatsApp, vá em **Aparelhos
conectados**, toque em **Conectar um aparelho** e aponte a câmera para o QR.

### Modo pairing code

Serve para servidor sem tela, onde ler um QR code é inviável. No `.env`:

```
LOGIN_MODE=pairing
PHONE_NUMBER=5517999999999
```

O número vai no formato internacional, sem `+`, sem espaços e sem traços. Rode o bot e
espere alguns segundos: um código de 8 caracteres aparece no log. No celular, vá em
**Aparelhos conectados**, **Conectar um aparelho**, **Conectar com número de telefone** e
digite o código.

A sessão fica salva em `auth/` e o login não se repete nas próximas execuções.

Se você desconectar o aparelho pelo celular, o bot avisa no log e encerra. Para voltar,
apague a pasta `auth/` e faça o login de novo.

## Uso

Mande a mídia para você mesmo com o comando na legenda, ou responda a uma mídia já
enviada com o comando.

| Comando | O que faz |
| --- | --- |
| `!s` | Figurinha mantendo a proporção. A sobra fica transparente. |
| `!sc` | Figurinha cortando o centro da imagem para preencher o quadrado. |
| `!help` | Mostra a lista de comandos. |

Funciona com foto, PNG com transparência, GIF, vídeo e figurinha existente. Vídeo é
cortado nos primeiros 8 segundos, o que se ajusta em `MAX_VIDEO_SECONDS`.

Mensagens sem comando não fazem nada. Conversa normal nunca aciona o bot.

## Contatos autorizados

Além da sua própria conversa, o bot pode atender uma lista de contatos. Em conversas
individuais com eles, o bot responde tanto a comandos enviados pelo contato quanto a
comandos enviados por você.

### Adicionar um número

No `.env`, liste os números separados por vírgula, no formato internacional sem `+`:

```
ALLOWED_NUMBERS=5517999999999,5511988887777
```

Reinicie o bot para a mudança valer. Com pm2, `pm2 restart figurinhas`.

### Remover um número

Apague o número da lista e reinicie. A remoção vale imediatamente: o bot passa a
ignorar essa pessoa.

Deixe `ALLOWED_NUMBERS` vazio para que o bot atenda somente você.

### Sobre o formato @lid

O WhatsApp está migrando a identificação de usuários de número de telefone para um
identificador interno chamado LID. Um contato pode chegar ao bot como `@lid` em vez de
`@s.whatsapp.net`, e nesse caso o número real não vem na mensagem.

O bot resolve isso em três etapas: usa o campo alternativo que o Baileys preenche
quando conhece o par, consulta o mapeamento interno da biblioteca, e guarda o resultado
em `data/lid-map.json`. Esse arquivo é o que mantém o reconhecimento funcionando depois
de reiniciar. Ele contém apenas pares de identificador e número, nunca conteúdo de
mensagem.

Se um contato autorizado não estiver sendo reconhecido, peça para ele mandar uma
mensagem qualquer primeiro. O bot aprende o mapeamento e passa a reconhecê-lo.

### Limite anti-abuso

`RATE_LIMIT_PER_MIN` define quantos comandos por minuto cada conversa pode disparar,
incluindo a sua. Acima disso o bot ignora em silêncio, sem responder nada.

## O que o bot nunca faz

- Responder em grupo, mesmo que um contato autorizado esteja nele
- Responder em status, listas de transmissão ou canais
- Responder a qualquer número fora da lista
- Reagir a mensagens sem comando
- Reagir às próprias figurinhas
- Marcar mensagens como lidas ou aparecer online

Grupos, transmissões e canais são descartados em duas camadas: na configuração do
socket, antes mesmo de a mensagem ser decifrada, e de novo no filtro de autorização.

## Configuração

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `LOGIN_MODE` | `qr` | `qr` ou `pairing` |
| `PHONE_NUMBER` | vazio | Seu número, só no modo pairing |
| `PACK_NAME` | `Minhas Figurinhas` | Nome do pacote na figurinha |
| `PACK_AUTHOR` | `Bot` | Autor exibido na figurinha |
| `ALLOWED_NUMBERS` | vazio | Contatos autorizados, separados por vírgula |
| `MAX_VIDEO_SECONDS` | `8` | Corte máximo de vídeo, de 1 a 15 |
| `MAX_INPUT_MB` | `20` | Tamanho máximo de entrada aceito |
| `COMMAND_PREFIX` | `!` | Prefixo dos comandos |
| `RATE_LIMIT_PER_MIN` | `10` | Comandos por minuto por conversa |
| `IGNORE_OLD_MESSAGES` | `true` | Ignora mensagens anteriores ao start |
| `FFMPEG_PATH` | `ffmpeg` | Caminho do binário do ffmpeg |
| `LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn` ou `error` |

Mantenha `IGNORE_OLD_MESSAGES=true`. Sem isso, um `!s` antigo dispararia de novo toda
vez que o bot reconectasse, gerando uma rajada de envios.

## Rodando em background com pm2

```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name figurinhas
```

O primeiro login precisa de terminal. Se ainda não houver sessão em `auth/`, faça o
login com `npm run dev` antes de entregar o processo ao pm2.

Comandos do dia a dia:

```bash
pm2 logs figurinhas
pm2 restart figurinhas
pm2 stop figurinhas
```

Para o bot voltar sozinho depois de reiniciar a máquina:

```bash
pm2 save
pm2 startup
```

No Windows, `pm2 startup` não funciona. Use `pm2-windows-startup` ou registre uma
tarefa no Agendador de Tarefas.

## Docker

```bash
docker build -t figurinhas .
docker run -d --name figurinhas \
  --env-file .env \
  -v "$(pwd)/auth:/app/auth" \
  -v "$(pwd)/data:/app/data" \
  figurinhas
```

Os dois volumes são obrigatórios. Sem eles a sessão e o cache de identificação se
perdem quando o container é recriado. Para o primeiro login, rode em foreground com
`docker run -it` e leia o QR code, ou use o modo pairing.

## Desenvolvimento

```bash
npm run dev        # roda com recarga automática
npm run build      # compila para dist/
npm start          # roda o compilado
npm test           # testes unitários
npm run typecheck  # checagem de tipos, incluindo os testes
```

Os testes cobrem a normalização de JID, o filtro de autorização e o parser de comandos.
Eles são puros e não abrem conexão nenhuma.

## Estrutura

```
src/
  index.ts                  conexão, login e reconexão
  config.ts                 leitura e validação do .env
  handlers/
    messageHandler.ts       orquestra o fluxo de uma mensagem
    authorization.ts        decide quem pode acionar o bot
    commandParser.ts        interpreta !s, !sc e !help
    mediaResolver.ts        acha a mídia, inclusive em mensagem citada
  sticker/
    index.ts                escolhe o caminho parado ou animado
    image.ts                conversão de imagem com sharp
    animated.ts             conversão de GIF e vídeo com ffmpeg
    exif.ts                 metadados do pacote
  utils/                    logger, JID, fila, rate limit, cache LID, temporários
auth/                       sessão do WhatsApp, não versionar
data/                       cache de identificação
tmp/                        arquivos temporários de conversão
```

## Problemas comuns

**O ffmpeg não é encontrado.** Confirme com `ffmpeg -version`. Se o comando funciona no
terminal mas o bot reclama, aponte o caminho completo em `FFMPEG_PATH`.

**A figurinha sai sem o nome do pacote.** O WhatsApp guarda o nome em cache. Feche e
reabra o aplicativo, ou teste com um nome de pacote diferente.

**O vídeo não vira figurinha.** Acima de 500 KB o bot tenta reduzir qualidade, depois
taxa de quadros e por último duração. Se ainda não couber, ele avisa. Mande um trecho
mais curto.

**Um contato autorizado é ignorado.** Suba com `LOG_LEVEL=debug`, peça para a pessoa
mandar o comando de novo e leia as duas linhas de diagnóstico.

A linha `mensagem ignorada` traz o campo `motivo`:

| motivo | O que significa |
| --- | --- |
| `not-authorized` | O número foi resolvido mas não bate com a lista. O campo `numeroResolvido` mostra o que o bot viu. Compare dígito a dígito com o `.env`. |
| `unresolved-identity` | A pessoa chegou como `@lid` e o bot ainda não sabe o número dela. Peça uma mensagem qualquer antes, para ele aprender. |
| `group` | A conversa é um grupo. O bot nunca responde em grupo. |
| `self-chat-not-from-me` | Anomalia no self-chat, a mensagem não veio de você. |

A linha `conversa autorizada, mas sem comando` significa que a pessoa passou no filtro
mas o texto não foi reconhecido como comando. O campo `tipoMensagem` mostra o formato
que chegou e `achouTexto` diz se havia legenda.

Sobre números brasileiros: celulares antigos podem aparecer sem o nono dígito. Se
`numeroResolvido` mostrar um número com um dígito a menos que o seu `.env`, use no
`ALLOWED_NUMBERS` exatamente o valor que apareceu no log.

**A conexão cai e volta o tempo todo.** Normal em rede instável: o bot reconecta com
espera progressiva. Se o log disser que a sessão foi encerrada, apague `auth/` e refaça
o login.
