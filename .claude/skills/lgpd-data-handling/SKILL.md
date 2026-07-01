---
name: lgpd-data-handling
description: >-
  Princípios de tratamento de dados pessoais (LGPD) deste projeto — nome, telefone e placa
  do cliente: minimização, finalidade, controle de acesso por RLS, compartilhamento
  (webhook/CSV) e retenção. Use ao adicionar/expor/exportar/logar dados de cliente, novos
  campos pessoais, novos destinos de dados, ou ao tratar de privacidade/retenção/LGPD.
---

# Tratamento de dados pessoais (LGPD)

Documento de referência: `LGPD.md` (raiz). Dados pessoais hoje: **nome, telefone, placa** na tabela `captacoes`.

## Princípios a aplicar em toda mudança
1. **Minimização:** só colete o necessário à finalidade (captação de lead). Campo "bom de ter" → questione.
2. **Finalidade/base legal:** uso coerente com `LGPD.md`. Se a finalidade mudar, atualize o documento junto com o código.
3. **Controle de acesso (RLS):** dado pessoal só acessível conforme papel — vendedor vê os próprios, gestor vê tudo. Nenhuma rota pode vazar dados de outro vendedor. (Ver skill `supabase-rls`.)
4. **Compartilhamento:** o **webhook** envia dados a um destino externo — URL/segredo fora do código (env/secret). A **exportação CSV** expõe dados em massa: restrita ao gestor.
5. **Logs:** não registre nome/telefone/placa em texto puro em logs ou mensagens de erro.
6. **Retenção:** respeite o prazo descrito em `LGPD.md`; não acumule dados sem necessidade.

## Quando esta skill é gatilho de revisão
Novo campo pessoal, nova exibição/exportação, novo destino de envio, mudança em quem acessa o quê, ou qualquer log que possa conter dado de cliente → faça o parecer (✅/⚠️/❌) e aponte a correção. Para revisão formal, use o agente `lgpd-reviewer`.
