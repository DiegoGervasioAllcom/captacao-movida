# Captação Movida

Plataforma onde **vendedores** fazem login e cadastram clientes através de um formulário. Cada captação é **gravada primeiro no banco (Supabase)** e só depois **encaminhada a um webhook externo** — garantindo que nenhum lead se perca se o destino estiver fora do ar. **Gestores** veem todas as captações, com busca e exportação CSV.

- **Frontend:** Next.js (App Router) + React + TypeScript
- **Autenticação:** Clerk (e-mail/senha, recuperação de senha, papéis)
- **Banco de dados:** Supabase (Postgres) — usado **apenas** como banco
- **Estilo:** CSS com design tokens (paleta *Kinetic Harvest*), mobile-first

---

## Sumário

1. [Visão geral](#visão-geral)
2. [Pré-requisitos](#pré-requisitos)
3. [Instalar e rodar localmente](#instalar-e-rodar-localmente)
4. [Configurar o Clerk](#1-configurar-o-clerk)
5. [Configurar o Supabase](#2-configurar-o-supabase)
6. [Ligar a integração Clerk + Supabase](#3-ligar-a-integração-clerk--supabase)
7. [⚠️ Nota importante sobre o claim `role`](#️-nota-importante-sobre-o-claim-role)
8. [Configurar o Database Webhook](#4-configurar-o-database-webhook)
9. [Definir papéis dos usuários](#5-definir-papéis-dos-usuários)
10. [Publicar (Vercel)](#publicar-na-vercel)
11. [Estrutura de pastas](#estrutura-de-pastas)
12. [LGPD](#lgpd)

---

## Visão geral

| Papel | O que vê / faz |
|-------|----------------|
| **vendedor** | Cadastra clientes e vê **apenas as próprias** captações |
| **gestor** | Vê **todas** as captações, com busca e exportação CSV |

O papel vem do Clerk: guardado em `publicMetadata.role` e incluído no *session token* como o claim **`app_role`** (não `role` — esse claim já pertence ao Supabase e vale sempre `authenticated`; ver nota abaixo). As policies de RLS do Supabase leem `auth.jwt()->>'sub'` (id do usuário no Clerk) e `auth.jwt()->>'app_role'` (papel).

**Fluxo de um lead:**

```
Vendedor preenche o formulário
        │
        ▼
1) INSERT em "captacoes" (Supabase)  ← fonte da verdade, nunca se perde
        │
        ▼
2) Database Webhook do Supabase dispara POST (JSON) ao destino externo
```

---

## Pré-requisitos

- Node.js 18.18+ (recomendado 20+)
- Conta no [Clerk](https://dashboard.clerk.com)
- Conta no [Supabase](https://supabase.com/dashboard)

---

## Instalar e rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Criar o arquivo de variáveis de ambiente
cp .env.example .env.local
#    Edite .env.local com suas chaves reais (veja seções abaixo)

# 3. Rodar em desenvolvimento
npm run dev
#    Abra http://localhost:3000
```

Outros comandos:

```bash
npm run build      # build de produção
npm run start      # roda o build
npm run typecheck  # checagem de tipos (sem emitir)
npm run lint       # ESLint
```

> Todas as chaves/URLs ficam em variáveis de ambiente. **Nunca** edite o código para colocar segredos. Veja `.env.example` para a lista completa.

---

## 1. Configurar o Clerk

1. Em [dashboard.clerk.com](https://dashboard.clerk.com), crie uma aplicação.
2. Em **Email, Phone, Username**, habilite **Email** + **Password** (e-mail/senha). A recuperação de senha já vem ativa por padrão.
3. Em **API Keys**, copie:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (publishable key)
   - `CLERK_SECRET_KEY` (secret key)
4. Cole no seu `.env.local`.

As rotas de login/cadastro deste projeto são `/sign-in` e `/sign-up` (já definidas no `.env.example`).

---

## 2. Configurar o Supabase

1. Em [supabase.com/dashboard](https://supabase.com/dashboard), crie um projeto.
2. Abra o **SQL Editor** (`Project > SQL Editor > New query`), cole o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql) e execute. Isso cria a tabela `captacoes`, o índice e as **policies de RLS**.
3. Em **Project Settings > Data API**, copie a **Project URL** (somente a base, ex.: `https://xxxx.supabase.co`) → `NEXT_PUBLIC_SUPABASE_URL`.
4. Em **Project Settings > API Keys**, copie a **Publishable key** (antiga *anon/public key*) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## 3. Ligar a integração Clerk + Supabase

> ⚠️ Os passos abaixo seguem a documentação oficial vigente (Clerk, atualizada em **18/06/2026**). Desde **01/04/2025** o antigo *JWT template* do Supabase está **deprecado**; a forma recomendada é a **integração nativa de third-party auth**. Os painéis mudam com frequência — confirme em:
> - Clerk: <https://clerk.com/docs/guides/development/integrations/databases/supabase>
> - Supabase: <https://supabase.com/docs/guides/auth/third-party/clerk>

1. **No painel do Clerk:** acesse [Supabase integration setup](https://dashboard.clerk.com/setup/supabase). Escolha as opções e clique em **Activate Supabase integration**. Isso revela o **Clerk domain** da sua instância. **Copie** esse domínio.
2. **No painel do Supabase:** vá em **Authentication > Sign In / Providers** (Third-party Auth). Clique em **Add provider** e escolha **Clerk**. Cole o **Clerk domain** copiado no passo anterior.
3. **Token do Clerk no cliente Supabase:** já está implementado em [`src/lib/supabase.ts`](./src/lib/supabase.ts), exatamente no padrão recomendado:

   ```ts
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
     accessToken: async () => (await window.Clerk?.session?.getToken()) ?? null,
   });
   ```

   No servidor (painel do gestor), usamos `auth().getToken()` — veja [`src/lib/supabase-server.ts`](./src/lib/supabase-server.ts).

4. **Customizar o session token com o papel.** No Clerk, vá em **Sessions > Customize session token** (Edit) e adicione o claim:

   ```json
   {
     "app_role": "{{user.public_metadata.role}}"
   }
   ```

   Assim, `auth.jwt()->>'app_role'` no Supabase devolve `vendedor` ou `gestor`.

### ⚠️ Nota importante sobre o claim `role`

A integração nativa do Supabase **espera** que o token traga o claim `role` com o valor **`authenticated`** (é assim que o PostgREST decide o papel do Postgres) — esse claim é gerenciado pelo próprio Supabase e **nunca** deve ser sobrescrito com `vendedor`/`gestor`.

Por isso o papel da aplicação vive em um claim **separado**, `app_role` (não `role`), lido em [`src/lib/roles.ts`](./src/lib/roles.ts) via `roleFromClaims(sessionClaims)`. Usuário sem `app_role` definido é tratado como `vendedor` (menor privilégio). Essa é a única forma usada neste projeto — ver regra de ouro nº 1 do `CLAUDE.md`.

---

## 4. Configurar o Database Webhook

O encaminhamento ao destino externo é feito pelo **Database Webhook** do Supabase, disparado **a cada INSERT** em `captacoes`. Assim, gravamos primeiro e o disparo é responsabilidade do banco — o lead nunca se perde.

1. No Supabase, vá em **Integrations > Webhooks** (a Supabase moveu essa tela de "Database" para "Integrations" — se o seu painel ainda mostrar em Database, use o caminho que aparecer) e clique em **Create a new hook** (habilite a feature se solicitado).
2. Configure:
   - **Name:** `encaminhar_captacao`
   - **Table:** `captacoes`
   - **Events:** `Insert`
   - **Type:** `HTTP Request`
   - **Method:** `POST`
   - **URL:** a URL do seu destino. **Não fixe no código** — guarde-a como referência em `WEBHOOK_URL` no `.env`. (O Supabase armazena a URL na configuração do hook; mantenha o valor real fora do repositório.)
   - **HTTP Headers:** `Content-Type: application/json` (e um header de segredo, se o destino exigir).
3. Salve. A cada nova captação, o Supabase enviará um POST com JSON no formato:

   ```json
   {
     "type": "INSERT",
     "table": "captacoes",
     "record": {
       "id": "…",
       "vendedor_id": "…",
       "vendedor_nome": "…",
       "loja": "…",
       "nome_cliente": "…",
       "telefone": "…",
       "placa": "…",
       "cpf": null,
       "email": null,
       "canal": "Indicação",
       "created_at": "…"
     },
     "schema": "public",
     "old_record": null
   }
   ```

   `cpf`/`email` só vêm preenchidos para captações com `vendedor_id = "vianuvem"` (ver [`vianuvem-import/`](./vianuvem-import/)); no formulário do vendedor esses dois campos sempre chegam nulos. `canal` indica a origem do lead: `"Indicação"` (formulário do vendedor) ou `"ViaNuvem"` (importação automática) — replicado na coluna CANAL das planilhas do Google Sheets.

> Dica: para esconder a URL/segredo do webhook e adicionar lógica (retries, transformação do payload), você pode apontar o hook para uma **Supabase Edge Function** que lê a URL real de uma *secret* (`supabase secrets set WEBHOOK_URL=…`) e repassa o POST. Isso mantém a URL totalmente fora do código e do banco.

### Destino em uso: Google Sheets via Apps Script

Além do webhook principal configurado acima, este projeto também usa (em paralelo, como um segundo Database Webhook na mesma tabela) um **Google Apps Script publicado como Web App** para replicar cada captação em uma de 3 planilhas, roteada pela loja do vendedor (`publicMetadata.loja`). Script completo em [`supabase/webhooks/captacoes-to-google-sheets.gs`](./supabase/webhooks/captacoes-to-google-sheets.gs), com o passo a passo de implantação no cabeçalho do próprio arquivo.

> ⚠️ Esse segundo webhook (Google Sheets) precisa estar configurado para os eventos **Insert E Update** (marque as duas caixas), diferente do webhook principal acima. O evento Update é disparado quando um vendedor "reivindica" pelo portal um lead que já existia (ex.: importado do ViaNuvem) — ver `registrar_captacao_vendedor` em `supabase/schema.sql`.

### Relatório de seguros por loja (endpoint `doGet`)

O mesmo Apps Script (`captacoes-to-google-sheets.gs`) também expõe um endpoint `doGet`, usado pelo painel do gestor para gerar o relatório mensal de seguros: lê, nas mesmas 3 planilhas, as colunas que o time de seguros preenche manualmente (OBS, DATA DA VENDA, STATUS DA VENDA, PREMIO LIQUIDO, SEGURADORA, MOTIVO) e devolve tudo em JSON para a rota `src/app/api/gestor/relatorio-seguros`, que sincroniza com a tabela `seguros_indicacao_movida` no Supabase e cruza com `captacoes` (por placa) para saber quantos seguros fecharam com ou sem indicação de vendedor.

1. Cole o `.gs` atualizado (com o `doGet`) no mesmo projeto Apps Script do webhook principal e **republique**: Implantar > Gerenciar implantações > editar a implantação ativa > Nova versão > Implantar. Só salvar o arquivo não basta — sem republicar, o `doGet` novo não fica no ar (mantém a mesma URL `/exec`).
2. Ícone de engrenagem > Propriedades do script > adicione `SEGUROS_READ_SECRET` com um valor aleatório novo (**não** reaproveite o `WEBHOOK_SECRET` — são segredos separados, um de escrita e um de leitura).
3. No `.env`, preencha:
   ```
   SEGUROS_SHEETS_URL=<mesma URL /exec do passo 1>
   SEGUROS_READ_SECRET=<mesmo valor do passo 2>
   ```
4. No painel do gestor, o botão "Baixar relatório do mês" chama `GET /api/gestor/relatorio-seguros?mes=YYYY-MM` (rota protegida — só `app_role = gestor`) e baixa um `.xlsx` com 2 abas, no layout da planilha de referência do time de seguros: **Resultado** (pivot por loja) e **Base** (detalhe bruto — todas as tentativas de venda do mês, não só as `Emitida`; "Tipo Seguro" nessa aba usa o campo `Seguradora`, já que os dados reais não têm um campo de "tipo" separado).

### Relatório de desempenho por loja e vendedor

Cada registro devolvido pelo `doGet` traz também a coluna **J STATUS** (andamento da negociação: "Sem contato", "Em negociação", "Venda transmitida"...), que vira `seguros_indicacao_movida.status_negociacao` e alimenta `GET /api/gestor/relatorio-desempenho?mes=YYYY-MM` — o `.xlsx` de **desempenho por loja e vendedor**, com 3 abas: **Por loja**, **Por vendedor** (agrupada por loja, com subtotal) e **Base** (lead a lead, com autofiltro). Ele mostra quantas indicações entraram via Nuvem x por vendedor, o status das negociações e as vendas pendentes/emitidas.

> Por causa desse status, o `doGet` devolve **toda linha com placa**, não só as com venda de seguro (um lead sem venda também tem andamento de negociação). Logo `seguros_indicacao_movida` passou a ter linha para toda placa das planilhas, com as colunas de seguro nulas quando não houve venda — o relatório de seguros e as métricas de transmissões seguem certos porque filtram por `status_venda`/`data_venda`, mas **nunca conte `count(*)` dessa tabela como "vendas de seguro"**.

Para este relatório funcionar em produção: rodar `alter table seguros_indicacao_movida add column status_negociacao text;` e **republicar** o Apps Script (salvar o arquivo não basta). Sem republicar, o campo não vem e o relatório sai com tudo em "Sem status".

> Só conta como "seguro fechado" a linha com `STATUS DA VENDA = "Emitida"`. `Cancelada`/`Recusada`/`Pendente` ficam sincronizadas na tabela `seguros_indicacao_movida` como histórico, mas não entram nos números do relatório. Ver `LGPD.md` seção 4.3 para a base legal desta origem de dado pessoal (placa).

O painel do gestor também mostra duas métricas agregadas: **Transmissões do dia** e
**Transmissões do mês**. As duas consultam diretamente no banco todo registro de
`seguros_indicacao_movida` cuja `data_venda` esteja no período, independentemente de
`status_venda`, usando o fuso `America/Sao_Paulo`. Cada card tem um botão **Atualizar**, que chama
`POST /api/gestor/sincronizar-seguros?periodo=dia|mes`. A rota reutiliza a mesma sincronização
completa das três planilhas executada antes do relatório mensal, faz upsert no banco e retorna
somente a contagem do período solicitado, sem montar ou baixar o `.xlsx`. O Apps Script não precisa
de nenhuma alteração ou nova publicação para esse fluxo.

---

## 5. Definir papéis dos usuários

O papel **não** é escolhido no cadastro; ele é atribuído por um admin no Clerk:

1. No painel do Clerk, vá em **Users**, selecione o usuário.
2. Em **Public metadata**, adicione:

   ```json
   { "role": "vendedor" }
   ```
   ou
   ```json
   { "role": "gestor" }
   ```

3. Salve. No próximo login (ou refresh do token), o papel já estará no session token.

> Usuários sem papel definido são tratados como **vendedor** (menor privilégio) pelo código.

---

## Publicar na Vercel

1. Suba o projeto para um repositório Git (GitHub/GitLab).
2. Em [vercel.com](https://vercel.com), **Import Project** e selecione o repositório.
3. Em **Environment Variables**, adicione **todas** as variáveis do `.env.example` com os valores reais.
4. Deploy. A Vercel detecta o Next.js automaticamente.
5. No Clerk, adicione o domínio de produção da Vercel em **Domains** (instância de produção) e gere as chaves `pk_live_…` / `sk_live_…` para o ambiente de produção.

---

## Estrutura de pastas

```
captacao-movida/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                  # ClerkProvider, fontes, metadata, viewport
│  │  ├─ page.tsx                    # raiz: redireciona por papel
│  │  ├─ globals.css                 # design tokens (Kinetic Harvest) + estilos
│  │  ├─ sign-in/[[...sign-in]]/page.tsx
│  │  ├─ sign-up/[[...sign-up]]/page.tsx
│  │  ├─ vendedor/page.tsx           # formulário + minhas captações
│  │  ├─ gestor/page.tsx             # tabela (SSR) + busca + CSV
│  │  └─ api/gestor/
│  │     └─ relatorio-seguros/route.ts  # .xlsx mensal (seguros x captações por loja)
│  ├─ components/
│  │  ├─ Brand.tsx
│  │  ├─ AppHeader.tsx
│  │  ├─ CapturaForm.tsx             # validação, máscaras, INSERT no Supabase
│  │  ├─ GestorClient.tsx            # busca + exportação CSV + relatório de seguros
│  │  ├─ login/                      # tela de login (LoginScreen, SignInForm)
│  │  └─ vendedor/                   # tela "Nova Indicação" componentizada
│  ├─ lib/
│  │  ├─ supabase.ts                 # cliente browser c/ token do Clerk
│  │  ├─ supabase-server.ts          # cliente server c/ token do Clerk
│  │  ├─ validation.ts               # telefone (10/11), placa (Mercosul/antiga)
│  │  ├─ format.ts                   # formatação de data/hora
│  │  ├─ roles.ts                    # utilitários de papel (claim app_role)
│  │  ├─ loja.ts                     # le publicMetadata.loja + LOJAS_DISPONIVEIS + lojaOficial()
│  │  └─ types.ts                    # tipos compartilhados
│  └─ middleware.ts                  # auth + autorização por papel
├─ supabase/
│  ├─ schema.sql                     # tabelas (captacoes, seguros_indicacao_movida) + índices + policies RLS
│  └─ webhooks/
│     └─ captacoes-to-google-sheets.gs  # Apps Script: destino Google Sheets (doPost) + doGet (leitura p/ relatório de seguros)
├─ vianuvem-import/                  # job standalone (Docker próprio) que importa
│                                     # leads do ViaNuvem/Unico Auto de hora em
│                                     # hora — ver vianuvem-import/README.md
├─ doc/                              # documentação técnica detalhada (HTML)
├─ .env.example                      # todas as variáveis (sem valores reais)
├─ README.md
├─ DOCKER.md                         # deploy do app principal via Docker
└─ LGPD.md                           # adequação à LGPD
```

---

## LGPD

O tratamento de dados pessoais dos clientes (nome, telefone, placa e, para captações importadas via `vianuvem-import/`, também CPF e e-mail) está descrito em [`LGPD.md`](./LGPD.md): base legal, finalidade, controle de acesso e retenção.
