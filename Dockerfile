# ffmpeg vem instalado na imagem, que e a unica dependencia externa do projeto.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Camada de dependencias separada para aproveitar o cache do Docker.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Sessao, cache de LID e temporarios. Monte auth e data como volumes, senao a
# sessao se perde a cada recriacao do container.
RUN mkdir -p auth data tmp && chown -R node:node /app
VOLUME ["/app/auth", "/app/data"]

USER node
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
