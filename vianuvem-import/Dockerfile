# =========================================================================
# vianuvem-import - imagem separada da do app Next.js de proposito (o
# Playwright e pesado, nao deve entrar na imagem de producao do app).
#
# Usa a imagem oficial do Playwright, que ja vem com o Chromium e TODAS as
# bibliotecas de sistema necessarias pre-instaladas - elimina o problema de
# precisar rodar `sudo apt-get install` no host pra essas dependencias.
#
# A tag da imagem (v1.47.0) tem que bater com a versao do pacote "playwright"
# no package.json - por isso ele esta fixado (sem "^") em 1.47.0. Se
# atualizar o package.json, atualize a tag aqui junto.
# =========================================================================
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts
# --ignore-scripts: pula o postinstall (que baixaria o Chromium de novo) -
# a imagem base ja tem o Chromium.

COPY . .

CMD ["node", "importar.mjs"]
