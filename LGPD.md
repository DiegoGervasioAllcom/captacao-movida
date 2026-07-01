# Adequação à LGPD — Captação Movida

Este documento descreve, de forma resumida, como a plataforma trata dados pessoais à luz da **Lei nº 13.709/2018 (LGPD)**. Não substitui aconselhamento jurídico: a empresa controladora deve validar este conteúdo com seu jurídico/DPO antes de operar em produção.

## 1. Papéis (LGPD)

- **Controlador:** a empresa que opera a Captação Movida (define as finalidades do tratamento).
- **Operadores:** Clerk (autenticação) e Supabase (banco de dados), que tratam os dados em nome do controlador. Recomenda-se manter contratos/DPAs com ambos e verificar onde os dados são hospedados (transferência internacional, art. 33).

## 2. Dados pessoais tratados

| Dado | Categoria | Origem |
|------|-----------|--------|
| Nome do cliente | Dado pessoal | Informado pelo vendedor |
| Telefone | Dado pessoal / contato | Informado pelo vendedor |
| Placa do veículo | Dado pessoal (pode identificar o titular) | Informado pelo vendedor |
| Identificação do vendedor (id/nome) | Dado do colaborador | Clerk |
| Data/hora da captação | Metadado | Gerado pelo sistema |

Não são coletados dados sensíveis (art. 5º, II). O formulário deve coletar **apenas** os campos necessários (minimização de dados, art. 6º, III).

## 3. Finalidade

Os dados são tratados para **registro e gestão de leads comerciais** (captação de clientes) e seu encaminhamento ao sistema de destino (webhook) para continuidade do atendimento/venda. É vedado o uso para finalidades incompatíveis com essa (art. 6º, I).

## 4. Base legal

A base legal deve ser definida pelo controlador conforme o caso de uso. Opções aplicáveis (art. 7º):

- **Consentimento do titular** (art. 7º, I) — recomendado quando o cliente fornece os dados diretamente para ser contatado. O consentimento deve ser livre, informado e registrável.
- **Procedimentos preliminares a um contrato** a pedido do titular (art. 7º, V) — quando a captação ocorre no contexto de uma negociação iniciada pelo cliente.
- **Legítimo interesse** (art. 7º, IX) — possível para prospecção, desde que feito o teste de proporcionalidade (LIA) e respeitados os direitos do titular.

> **Recomendação:** registrar a base legal adotada e, se for consentimento, incluir no fluxo de captação um aviso claro e o aceite do titular antes do envio. O vendedor deve informar ao cliente a finalidade e quem é o controlador.

## 5. Direitos do titular

O titular pode solicitar (art. 18): confirmação e acesso, correção, anonimização/bloqueio/eliminação, portabilidade, informação sobre compartilhamento e revogação do consentimento. O controlador deve disponibilizar um canal (ex.: e-mail do DPO) e um procedimento para atender essas solicitações dentro dos prazos legais.

## 6. Controle de acesso

- **Autenticação** via Clerk (e-mail/senha, recuperação de senha).
- **Autorização por papel**, aplicada em duas camadas:
  - **Aplicação:** middleware do Next.js restringe rotas (vendedor x gestor).
  - **Banco (defesa principal):** Row Level Security (RLS) no Supabase. O vendedor só lê/insere as **próprias** captações (`auth.jwt()->>'sub' = vendedor_id`); o gestor lê todas (`role = 'gestor'`). Sem token válido do Clerk, o acesso é negado.
- **Princípio do menor privilégio:** usuários sem papel definido são tratados como vendedor.
- **Segredos** (chaves, URL do webhook) ficam exclusivamente em variáveis de ambiente, nunca no código ou no repositório.

## 7. Compartilhamento com terceiros

Os dados são encaminhados a um **webhook externo** (sistema de destino do controlador). O controlador deve garantir que esse destino tenha base legal e medidas de segurança adequadas, e mapear esse compartilhamento no registro de operações (art. 37).

## 8. Segurança da informação

- Tráfego sobre HTTPS (Vercel/Supabase/Clerk).
- Acesso ao banco mediado por RLS e tokens de curta duração do Clerk.
- Recomenda-se: habilitar logs/auditoria, restringir quem tem acesso aos painéis de Clerk/Supabase/Vercel, e usar header de segredo no webhook.

## 9. Retenção e eliminação

- Defina um **prazo de retenção** compatível com a finalidade (ex.: enquanto durar a negociação + período legal aplicável). Após o término da finalidade, os dados devem ser **eliminados ou anonimizados** (art. 15 e 16).
- Implemente uma rotina periódica de expurgo (ex.: job que apaga captações além do prazo) e atenda a pedidos de exclusão do titular.
- A eliminação definitiva de dados deve ser executada por um administrador autorizado, com registro da operação.

## 10. Registro de operações e incidentes

- Manter o **registro das operações de tratamento** (art. 37).
- Ter um plano de resposta a incidentes: em caso de vazamento, comunicar a ANPD e os titulares quando houver risco relevante (art. 48).

---

_Documento de referência interna. Ajuste as bases legais, prazos e responsabilidades conforme a orientação do DPO/jurídico do controlador._
