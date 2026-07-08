# Adequação à LGPD — Captação Movida

Este documento descreve, de forma resumida, como a plataforma trata dados pessoais à luz da **Lei nº 13.709/2018 (LGPD)**. Não substitui aconselhamento jurídico: a empresa controladora deve validar este conteúdo com seu jurídico/DPO antes de operar em produção.

## 1. Papéis (LGPD)

- **Controlador:** a empresa que opera a Captação Movida (define as finalidades do tratamento).
- **Operadores:** Clerk (autenticação) e Supabase (banco de dados), que tratam os dados em nome do controlador. Recomenda-se manter contratos/DPAs com ambos e verificar onde os dados são hospedados (transferência internacional, art. 33).
- **Google (Google Sheets / Apps Script)**, quando configurado como destino adicional do Database Webhook: recebe uma cópia dos dados de cada captação para fins de planilha/acompanhamento. Deve ser tratado como operador nos termos do art. 5º, VII, com as mesmas ressalvas de contrato/DPA e localização dos dados (art. 33) aplicadas ao Supabase/Clerk.

## 2. Dados pessoais tratados

| Dado | Categoria | Origem |
|------|-----------|--------|
| Nome do cliente | Dado pessoal | Informado pelo vendedor OU importado do ViaNuvem/Unico Auto |
| Telefone | Dado pessoal / contato | Informado pelo vendedor OU importado do ViaNuvem/Unico Auto |
| Placa do veículo | Dado pessoal (pode identificar o titular) | Informado pelo vendedor OU importado do ViaNuvem/Unico Auto |
| CPF | Dado pessoal de identificação direta | Importado do ViaNuvem/Unico Auto (nunca coletado pelo formulário do vendedor) |
| E-mail | Dado pessoal / contato | Importado do ViaNuvem/Unico Auto (nunca coletado pelo formulário do vendedor) |
| Identificação do vendedor (id/nome) | Dado do colaborador | Clerk, ou valor fixo `"vianuvem"` para captações importadas automaticamente |
| Loja/estabelecimento | Metadado operacional | `publicMetadata.loja` (Clerk) ou "Estabelecimento" do relatório ViaNuvem |
| Data/hora da captação | Metadado | Gerado pelo sistema |

Não são coletados dados sensíveis (art. 5º, II). O formulário deve coletar **apenas** os campos necessários (minimização de dados, art. 6º, III).

**CPF e e-mail** entraram no schema para suportar a importação automática do ViaNuvem/Unico Auto (`vianuvem-import/`) e alimentam as colunas correspondentes das 3 planilhas do Google Sheets (seção 7) — finalidade definida: preencher os campos CPF/E-mail que a planilha gerencial já tinha. Só são preenchidos para captações com `vendedor_id = "vianuvem"`; captações do formulário do vendedor continuam sem esses 2 campos.

## 3. Finalidade

Os dados são tratados para **registro e gestão de leads comerciais** (captação de clientes) e seu encaminhamento ao sistema de destino (webhook) para continuidade do atendimento/venda. É vedado o uso para finalidades incompatíveis com essa (art. 6º, I).

## 4. Base legal

A base legal deve ser definida pelo controlador conforme o caso de uso. Opções aplicáveis (art. 7º):

- **Consentimento do titular** (art. 7º, I) — recomendado quando o cliente fornece os dados diretamente para ser contatado. O consentimento deve ser livre, informado e registrável.
- **Procedimentos preliminares a um contrato** a pedido do titular (art. 7º, V) — quando a captação ocorre no contexto de uma negociação iniciada pelo cliente.
- **Legítimo interesse** (art. 7º, IX) — possível para prospecção, desde que feito o teste de proporcionalidade (LIA) e respeitados os direitos do titular.

> **Recomendação:** registrar a base legal adotada e, se for consentimento, incluir no fluxo de captação um aviso claro e o aceite do titular antes do envio. O vendedor deve informar ao cliente a finalidade e quem é o controlador.

### 4.1 Origem adicional: importação automática do ViaNuvem/Unico Auto

A tabela `captacoes` também recebe registros de um job standalone (`vianuvem-import/`) que faz login automatizado no sistema de terceiro **ViaNuvem/Unico Auto** (usado para gestão de processos de financiamento/consórcio de veículos) e importa, de hora em hora, os processos em andamento como leads.

Isso é uma origem de dados **fundamentalmente diferente** do formulário do vendedor: o titular não interage com a Captação Movida nesse momento, não preenche nada nela. Os dados já existiam em outro sistema (ViaNuvem), no contexto de um processo de financiamento de veículo, e são **replicados** para `captacoes` com a finalidade de gestão comercial do lead pela loja responsável por aquele processo.

**Base legal aplicável a esta origem:** legítimo interesse (art. 7º, IX), fundamentado no interesse comercial de dar continuidade a processos de financiamento já iniciados nas próprias lojas. **Não se aplica aqui a base de consentimento do titular** para com a Captação Movida especificamente — o titular consentiu (ou não) no contexto do processo de financiamento original, perante o ViaNuvem/Unico Auto e/ou a loja que o atendeu, não com este sistema.

> **Pendência a resolver com o jurídico/DPO do controlador:** documentar o teste de proporcionalidade (LIA) para o legítimo interesse aplicado a esta origem, e avaliar se é necessário informar o titular (art. 9º) de que seus dados também trafegam pela Captação Movida além do sistema ViaNuvem original.

**Risco identificado e aceito conscientemente:** o acesso aos dados na origem depende de login automatizado (Playwright) com credenciais de um usuário da plataforma ViaNuvem, sem uma integração de API oficial nem acordo formal entre o controlador e o ViaNuvem/Unico Auto especificamente para esse tipo de extração automatizada. Do ponto de vista de proteção de dados, a base legal e finalidade originais desses dados (perante o ViaNuvem) não são plenamente controladas nem auditáveis pelo controlador. Recomenda-se buscar uma integração de API oficial com o ViaNuvem/Unico Auto (há indício de categoria "TESTE API - USO EXCLUSIVO" na conta) para eliminar essa lacuna a médio prazo.

**`vendedor_id = "vianuvem"`:** captações importadas por este job recebem um `vendedor_id` fixo que não corresponde a nenhum usuário real do Clerk. Por consequência das policies de RLS (seção 6), esses registros são visíveis **apenas ao gestor** — comportamento esperado e verificado.

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

Os dados são encaminhados a um ou mais **destinos configurados no Database Webhook** (sistemas do controlador). Cada destino deve ser listado no registro de operações (art. 37), com finalidade própria documentada. O controlador deve garantir que cada destino tenha base legal e medidas de segurança adequadas. Destinos em uso:

- **Webhook externo principal:** sistema de CRM/atendimento do controlador (finalidade e medidas de segurança a documentar pelo controlador).
- **Google Sheets (via Google Apps Script Web App):** cópia de nome, telefone, placa, vendedor e data/hora, para acompanhamento/planilha gerencial (ver `supabase/webhooks/captacoes-to-google-sheets.gs`). O script roteia cada captação para **uma de 3 planilhas** conforme a loja do vendedor (`publicMetadata.loja` no Clerk). Pontos de atenção específicos deste destino:
  - Nenhuma das 3 planilhas tem RLS: qualquer pessoa com acesso de leitura no Google Workspace vê os dados de **todos** os vendedores daquela planilha (várias lojas por planilha), equivalente ao nível de acesso de um gestor. O compartilhamento de cada planilha deve ser restrito à mesma lista de pessoas autorizadas como "gestor" na aplicação.
  - O Web App do Apps Script aceita POST de "qualquer pessoa" (é assim que o Supabase consegue chamá-lo); a única proteção é um segredo em query string, que deve ser tratado como credencial de produção (nunca no código, rotação se vazar — regra de ouro nº 5 do `CLAUDE.md`).
  - Não há confirmação de entrega: falhas nesse destino (incluindo loja sem planilha mapeada) não ficam visíveis ao Supabase, o que pode gerar divergência entre a fonte da verdade (`captacoes`) e as planilhas.

## 8. Segurança da informação

- Tráfego sobre HTTPS (Vercel/Supabase/Clerk).
- Acesso ao banco mediado por RLS e tokens de curta duração do Clerk.
- Recomenda-se: habilitar logs/auditoria, restringir quem tem acesso aos painéis de Clerk/Supabase/Vercel, e usar header de segredo no webhook.
- Nenhum processo (incluindo jobs de importação como `vianuvem-import/`) deve logar nome, telefone, CPF ou e-mail em texto puro. Identificadores como placa, quando necessários para diagnóstico, devem ser parcialmente mascarados no log (ex.: mostrar apenas os últimos 3 caracteres).

## 9. Retenção e eliminação

- Defina um **prazo de retenção** compatível com a finalidade (ex.: enquanto durar a negociação + período legal aplicável). Após o término da finalidade, os dados devem ser **eliminados ou anonimizados** (art. 15 e 16).
- Implemente uma rotina periódica de expurgo (ex.: job que apaga captações além do prazo) e atenda a pedidos de exclusão do titular.
- A eliminação definitiva de dados deve ser executada por um administrador autorizado, com registro da operação.
- A rotina de expurgo/eliminação deve alcançar **todas as cópias** dos dados pessoais, incluindo as 3 planilhas do Google Sheets alimentadas pelo webhook secundário (seção 7) — eliminar apenas no Supabase não é suficiente para atender a um pedido de exclusão do titular (art. 18, IV).
- **Captações importadas do ViaNuvem** (`vendedor_id = "vianuvem"`) devem ter um prazo de retenção reavaliado periodicamente: como o controlador não tem visibilidade de quando o processo de financiamento original termina no ViaNuvem, não é possível hoje calcular automaticamente "enquanto durar a negociação" para esses registros. Até que essa integração exista, trate o prazo de forma conservadora (revisão manual periódica) e não superior ao prazo aplicado às captações do formulário.
- **CPF**, quando presente, deve ter prazo de retenção igual ou mais curto que os demais campos, dado que seu uso hoje é preencher a planilha gerencial (seção 7) e não há atendimento contínuo baseado nele — a placa (não o CPF) é a chave usada para deduplicação.

## 10. Registro de operações e incidentes

- Manter o **registro das operações de tratamento** (art. 37).
- Ter um plano de resposta a incidentes: em caso de vazamento, comunicar a ANPD e os titulares quando houver risco relevante (art. 48).

---

_Documento de referência interna. Ajuste as bases legais, prazos e responsabilidades conforme a orientação do DPO/jurídico do controlador._
