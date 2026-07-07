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

O papel vem do Clerk: guardado em `publicMetadata.role` e incluído no *session token* como o claim `role`. As policies de RLS do Supabase leem `auth.jwt()->>'sub'` (id do usuário no Clerk) e `auth.jwt()->>'role'` (papel).

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
     "role": "{{user.public_metadata.role}}"
   }
   ```

   Assim, `auth.jwt()->>'role'` no Supabase devolve `vendedor` ou `gestor`.

### ⚠️ Nota importante sobre o claim `role`

A integração nativa do Supabase **espera** que o token traga o claim `role` com o valor **`authenticated`** (é assim que o PostgREST decide o papel do Postgres). Se você sobrescrever `role` com `vendedor`/`gestor` no session token, as requisições autenticadas podem ser **rejeitadas** pelo Supabase.

Você tem duas opções:

- **Opção A (recomendada, mais robusta):** mantenha o `role` reservado para o Supabase (`authenticated`) e use **outro claim** para o papel da aplicação, por exemplo `user_role`:

  ```json
  { "user_role": "{{user.public_metadata.role}}" }
  ```

  E ajuste a policy do gestor em `supabase/schema.sql` para ler `auth.jwt()->>'user_role'`:

  ```sql
  create policy "gestor le tudo"
  on captacoes for select
  using ( (auth.jwt()->>'user_role') = 'gestor' );
  ```

  Se optar por isso, ajuste também as leituras no código (`sessionClaims.role` → `sessionClaims.user_role` em `middleware.ts`, `page.tsx` e `gestor/page.tsx`).

- **Opção B (segue o enunciado à risca):** usar o claim `role` conforme especificado. Funciona em cenários onde o Supabase aceita o valor, mas valide o comportamento no seu projeto antes de ir para produção, pois pode conflitar com a exigência do `role: authenticated`.

> O código e o SQL deste repositório vêm na **Opção B** (claim `role`), exatamente como solicitado. Migrar para a Opção A é uma troca de nome de claim em 4 lugares (documentados acima).

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
       "created_at": "…"
     },
     "schema": "public",
     "old_record": null
   }
   ```

> Dica: para esconder a URL/segredo do webhook e adicionar lógica (retries, transformação do payload), você pode apontar o hook para uma **Supabase Edge Function** que lê a URL real de uma *secret* (`supabase secrets set WEBHOOK_URL=…`) e repassa o POST. Isso mantém a URL totalmente fora do código e do banco.

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
│  │  └─ gestor/page.tsx             # tabela (SSR) + busca + CSV
│  ├─ components/
│  │  ├─ Brand.tsx
│  │  ├─ AppHeader.tsx
│  │  ├─ CapturaForm.tsx             # validação, máscaras, INSERT no Supabase
│  │  └─ GestorClient.tsx            # busca + exportação CSV
│  ├─ lib/
│  │  ├─ supabase.ts                 # cliente browser c/ token do Clerk
│  │  ├─ supabase-server.ts          # cliente server c/ token do Clerk
│  │  ├─ validation.ts               # telefone (10/11), placa (Mercosul/antiga)
│  │  ├─ format.ts                   # formatação de data/hora
│  │  ├─ roles.ts                    # utilitários de papel
│  │  └─ types.ts                    # tipos compartilhados
│  └─ middleware.ts                  # auth + autorização por papel
├─ supabase/
│  └─ schema.sql                     # tabela + índice + policies RLS
├─ .env.example                      # todas as variáveis (sem valores reais)
├─ README.md
└─ LGPD.md                           # adequação à LGPD
```

---

## LGPD

O tratamento de dados pessoais dos clientes (nome, telefone, placa) está descrito em [`LGPD.md`](./LGPD.md): base legal, finalidade, controle de acesso e retenção.
