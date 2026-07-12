---
name: captacao-validation
description: >-
  Regras e máscaras de validação brasileiras do projeto: telefone (10/11 dígitos), placa
  (Mercosul ABC1D23 e antiga ABC1234), nome obrigatório, e onde os helpers são reusados
  (formulário de indicação via RPC e autocadastro do vendedor com revalidação no
  servidor). Use ao mexer em formulários, validação, máscaras de input, ou ao
  adicionar/alterar campos da captação ou do cadastro.
---

# Validação (regras BR)

Tudo centralizado em `src/lib/validation.ts`. **Nunca duplique regex** — importe os helpers.

## Helpers existentes
- `somenteDigitos(v)` — remove tudo que não é dígito.
- `mascararTelefone(v)` — aplica `(00) 0000-0000` ou `(00) 00000-0000`, até 11 dígitos. Use no `onChange` do input de telefone.
- `telefoneValido(v)` — true se 10 (fixo) ou 11 (celular) dígitos.
- `normalizarPlaca(v)` — uppercase, só `[A-Z0-9]`, máximo 7 chars. Use no `onChange` da placa.
- `placaValida(v)` — aceita antiga `ABC1234` **ou** Mercosul `ABC1D23`.
- `validarCaptacao(dados)` → objeto `ErrosCaptacao` (vazio = ok). Valida nome, telefone, placa de uma vez.

## Regras do formulário de indicação
- **Nome do cliente:** obrigatório (após `trim`). **Telefone:** 10 ou 11 dígitos ("Telefone deve ter 10 ou 11 digitos."). **Placa:** Mercosul ou antiga ("Placa invalida. Use ABC1D23 (Mercosul) ou ABC1234.").

## Padrão ao gravar a indicação (NUNCA INSERT direto — regra 10 do CLAUDE.md)
No submit do `CapturaForm`:
1. `validarCaptacao` no cliente (bloqueia se houver erros).
2. Chamar a RPC: `supabase.rpc("registrar_captacao_vendedor", { p_vendedor_nome, p_vendedor_telefone, p_loja, p_nome_cliente: nome.trim(), p_telefone: telefone.trim(), p_placa: normalizarPlaca(placa) })`.
3. Tratar erros por regex em `error.message`: `/PLACA_DE_OUTRO_VENDEDOR/` → "Essa placa já foi indicada por outro vendedor."; `/jwt|exp|auth|NAO_AUTENTICADO/i` → sessão expirada. Sucesso → `onCriada(data as Captacao)`.

## Validações do autocadastro do vendedor (reuso dos helpers fora da captação)
- **Cliente** (`SignUpForm.tsx`): telefone do VENDEDOR validado com `telefoneValido` antes do `signUp.create` (mesma mensagem) e mascarado com `mascararTelefone` no `onChange`; loja = `<select required>` populado por `LOJAS_DISPONIVEIS` (`src/lib/loja.ts`); senha = `minLength={8}` no HTML (regras reais ficam no Clerk); e-mail = `type="email" required` (erro traduzido por `clerkError`).
- **Servidor** (`/api/vendedor/perfil`): revalida loja ∈ `LOJAS_DISPONIVEIS` (400 "Loja invalida.") e `telefoneValido(telefone)` (400 "Telefone invalido.") antes de promover pra `publicMetadata`. Mudou a regra no cliente? Mude na rota junto.

## Ao adicionar um campo novo
1. Helper de validação/máscara em `validation.ts`. 2. Incluir em `ErrosCaptacao`/`DadosCaptacaoForm` e em `validarCaptacao`. 3. Atualizar `src/lib/types.ts`, o schema **e a assinatura da RPC** se o campo for gravado (skill `supabase-rls`); campo que vai pra planilha → skill `sheets-webhook`. 4. Dado pessoal → agente `lgpd-reviewer`.
