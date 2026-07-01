[OPEN] Clerk baseFetch runtime error

- Session ID: `clerk-basefetch-error`
- Started at: `2026-06-30`
- Symptom: erro no console vindo de `clerk.browser.js` em `_baseFetch`
- Scope: carregamento/autenticacao do Clerk no frontend

## Hipoteses

1. O domínio/public key do Clerk não corresponde à instância configurada e o SDK falha ao buscar recursos iniciais.
2. O frontend está carregando o Clerk de um domínio customizado com configuração incompleta de proxies/CORS.
3. Há incompatibilidade entre variáveis de ambiente presentes no `.env` e o ambiente esperado pelo `@clerk/nextjs`.
4. O app sobe localmente, mas o navegador não consegue resolver/autorizar requisições para `clerk.supperseguros.com.br`.
5. A versão do `@clerk/nextjs` está correta, mas falta alguma configuração obrigatória no `ClerkProvider` ou no middleware.

## Evidencias coletadas

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` usa prefixo `pk_live_...`.
- O stack aponta para `https://clerk.supperseguros.com.br/npm/@clerk/clerk-js@5.127.0/dist/clerk.browser.js`.
- O projeto usa `@clerk/nextjs@6.12.0` e `ClerkProvider` padrao em `src/app/layout.tsx`.
- `curl -I https://clerk.supperseguros.com.br/npm/@clerk/clerk-js@5.127.0/dist/clerk.browser.js` retorna `HTTP/2 200`.
- `curl -i https://clerk.supperseguros.com.br/v1/client` responde normalmente sem `Origin`.
- `curl -i -H 'Origin: http://localhost:3001' https://clerk.supperseguros.com.br/v1/client` retorna `HTTP/2 400` com erro `origin_invalid` e mensagem: `The Request HTTP Origin header must be equal to or a subdomain of the requesting URL.`

## Analise

- Hipotese 1: parcialmente confirmada. A chave publica aponta para a instancia `clerk.supperseguros.com.br`, mas ela nao aceita a origem `localhost`.
- Hipotese 2: confirmada. O problema esta na restricao de origem do dominio customizado/Frontend API do Clerk.
- Hipotese 3: nao ha evidencia de variavel ausente ou formato invalido no app.
- Hipotese 4: confirmada no navegador/local. O erro ocorre quando a origem local tenta chamar a Frontend API live.
- Hipotese 5: rejeitada por enquanto. Nao apareceu problema de uso do `ClerkProvider` ou do middleware.

## Proximos passos

1. Trocar o ambiente local para uma chave de desenvolvimento do Clerk (`pk_test_...` / `sk_test_...`) ou uma instancia que aceite `localhost`.
2. Se a intencao for usar a instancia live localmente, ajustar os dominios/origens permitidos no painel do Clerk.
3. Confirmar no navegador se o erro desaparece apos alinhar a origem.
