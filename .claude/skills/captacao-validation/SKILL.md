---
name: captacao-validation
description: >-
  Regras e máscaras de validação brasileiras do formulário de captação: telefone (10/11
  dígitos), placa (Mercosul ABC1D23 e antiga ABC1234) e nome obrigatório. Use ao mexer em
  formulários, validação, máscaras de input, ou ao adicionar/alterar campos da captação.
---

# Validação da captação (regras BR)

Tudo centralizado em `src/lib/validation.ts`. **Nunca duplique regex** — importe os helpers.

## Helpers existentes
- `somenteDigitos(v)` — remove tudo que não é dígito.
- `mascararTelefone(v)` — aplica `(00) 0000-0000` ou `(00) 00000-0000`, até 11 dígitos. Use no `onChange` do input de telefone.
- `telefoneValido(v)` — true se 10 (fixo) ou 11 (celular) dígitos.
- `normalizarPlaca(v)` — uppercase, só `[A-Z0-9]`, máximo 7 chars. Use no `onChange` da placa.
- `placaValida(v)` — aceita antiga `ABC1234` **ou** Mercosul `ABC1D23`.
- `validarCaptacao(dados)` → objeto `ErrosCaptacao` (vazio = ok). Valida nome, telefone, placa de uma vez.

## Regras de negócio
- **Nome do cliente:** obrigatório (após `trim`).
- **Telefone:** obrigatório; 10 ou 11 dígitos. Mensagem: "Telefone deve ter 10 ou 11 digitos."
- **Placa:** obrigatória; Mercosul (`^[A-Z]{3}[0-9][A-Z][0-9]{2}$`) ou antiga (`^[A-Z]{3}[0-9]{4}$`). Mensagem: "Placa invalida. Use ABC1D23 (Mercosul) ou ABC1234."

## Padrão ao gravar
No submit: 1) `validarCaptacao` no cliente (bloqueia se houver erros); 2) `insert` no Supabase salvando `nome.trim()`, `telefone.trim()`, `normalizarPlaca(placa)`. Veja `src/components/CapturaForm.tsx` como referência.

## Ao adicionar um campo novo
1. Adicione helper de validação/máscara aqui em `validation.ts`. 2. Inclua em `ErrosCaptacao`/`DadosCaptacaoForm` e em `validarCaptacao`. 3. Atualize `src/lib/types.ts` e o schema (skill `supabase-rls`). 4. Avalie LGPD se for dado pessoal (agente `lgpd-reviewer`).
