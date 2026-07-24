// =========================================================================
// Captacao Movida - Destino do Database Webhook: Google Sheets
// (roteado por loja para 3 planilhas diferentes)
//
// Recebe o POST que o Database Webhook do Supabase dispara a cada INSERT ou
// UPDATE em `captacoes` (ver README.md secao "4. Configurar o Database
// Webhook" - o webhook precisa estar configurado para OS DOIS eventos, nao
// so Insert), descobre em qual das 3 planilhas a loja do vendedor cai
// (LOJA_PARA_PLANILHA abaixo) e adiciona (INSERT) ou atualiza (UPDATE) uma
// linha la. O UPDATE acontece quando um vendedor "reivindica" pelo portal
// um lead que ja existia (ex.: importado do ViaNuvem) - ver
// registrar_captacao_vendedor no schema.sql.
//
// Este e um projeto Apps Script STANDALONE (nao vinculado a nenhuma das
// planilhas) - precisa ser assim porque escreve em 3 arquivos diferentes.
// Se voce ja tem um projeto criado em https://script.google.com, use ele.
//
// E-MAIL e CPF (`record.email`/`record.cpf`) sao preenchidos quando a
// captacao vem da importacao automatica do ViaNuvem (vendedor_id =
// "vianuvem", ver vianuvem-import/) - o formulario do vendedor nao coleta
// esses 2 campos, entao ficam em branco nesse caso. A coluna STATUS
// continua em branco sempre (preenchimento manual do time). LOJA e
// preenchida automaticamente com `record.loja` (mesmo valor que decide o
// roteamento - ver LOJA_PARA_PLANILHA). Ver LGPD.md secao 4.1 para a base
// legal do fluxo ViaNuvem, diferente do fluxo de indicacao do vendedor.
//
// Colunas da aba "Página1" em cada planilha (linha 2 = cabecalho, dados a
// partir da linha 3) - atualizado em 09/07/2026 apos as 3 planilhas
// ganharem a coluna "CANAL" (antes era A-I, sem ela; o time preenche
// manualmente, o webhook so deixa em branco):
//   A DATA | B CANAL | C VENDEDOR | D LOJA | E NOME | F CELULAR
//   G E-MAIL | H CPF | I PLACA | J STATUS
//
// COMO IMPLANTAR (copie este arquivo, nao rode daqui):
//   1. Em https://script.google.com, abra (ou crie) um projeto STANDALONE
//      (NAO use Extensoes > Apps Script de dentro de uma planilha).
//   2. Apague o conteudo de Code.gs e cole este arquivo inteiro.
//   3. Rode setupSheet() uma vez (menu Executar > selecione "setupSheet").
//      Isso vai pedir autorizacao para acessar suas planilhas do Google -
//      aceite. Cria so a aba de log de erro; NAO mexe nas 3 abas "Página1"
//      (elas ja existem com dados reais).
//   4. Icone de engrenagem (Configuracoes do projeto) > Propriedades do
//      script > adicione WEBHOOK_SECRET com um valor aleatorio (ex.: gere
//      com `openssl rand -hex 16` no terminal). Esse segredo NUNCA vai no
//      codigo - fica so aqui e na URL do webhook (passo 6).
//   5. Implantar > Nova implantacao > tipo "App da Web".
//        - Executar como: Eu (sua conta)
//        - Quem pode acessar: Qualquer pessoa
//      Copie a URL gerada (termina em /exec).
//   6. No Supabase: Integrations > Webhooks (pode aparecer em Database, a
//      Supabase mudou essa tela de lugar algumas vezes) > Create a new hook
//        - Table: captacoes | Events: Insert E Update (os DOIS, marque as
//          duas caixas - Update e usado quando um vendedor reivindica um
//          lead do ViaNuvem pelo portal) | Type: HTTP Request
//        - Method: POST
//        - URL: <URL do passo 5>?secret=<mesmo valor do passo 4>
//        - HTTP Headers: Content-Type: application/json
//   7. No Clerk, para CADA vendedor, defina `publicMetadata.loja` com um
//      dos nomes EXATOS listados em LOJA_PARA_PLANILHA abaixo (maiusculas/
//      acentos nao importam - o script normaliza - mas o texto tem que
//      ser um dos nomes da lista, senao cai em "loja sem planilha mapeada"
//      e vai para o log de erro em vez de para uma planilha).
//
// SE UMA LOJA NOVA APARECER: adicione uma linha em LOJA_PARA_PLANILHA
// apontando para 'everton' | 'wesley' | 'william' e reimplante o Web App.
//
// ATENCAO - validacao em lista (dropdown) da coluna STATUS: se ela estiver
// configurada so ate a ultima linha atual de cada planilha, pode nao
// aparecer nas linhas novas. Se acontecer, selecione a coluna I inteira e
// reaplique Dados > Validacao de dados na planilha em questao.
//
// LIMITACAO CONHECIDA: Google Apps Script sempre responde HTTP 200 para
// Web Apps, mesmo em erro interno - o Supabase nao vai "ver" uma falha
// para tentar de novo. Por isso, qualquer erro (segredo invalido, loja sem
// planilha mapeada, payload malformado, etc.) e registrado na planilha de
// log (PLANILHA_ERROS) - SEM gravar dado pessoal (ver registrarErro): so
// timestamp, mensagem e o id tecnico do registro, nunca nome/telefone/
// placa. Isso evita criar uma segunda copia de dado pessoal sem controle
// de acesso/retencao (regra de ouro 9 do CLAUDE.md).
//
// ENDPOINT `doGet` - leitura para o relatorio de seguros por loja: o time
// de seguros preenche manualmente, nas mesmas 3 planilhas, colunas alem do
// contrato A-J documentado acima (OBS, DATA DA VENDA, STATUS DA VENDA,
// PREMIO LIQUIDO, SEGURADORA, MOTIVO). O `doGet` le essas colunas por NOME
// do cabecalho (linha 1, normalizado com a mesma `normalizarTexto` usada
// para loja - sem assumir letra fixa, porque a 3a planilha (wesley) pode
// nao ter essas colunas na mesma posicao das outras duas) e devolve tudo
// em JSON, para a rota do painel do gestor (`api/gestor/relatorio-seguros`,
// fora deste arquivo) sincronizar com a tabela `seguros_indicacao_movida` do
// Supabase.
// Protegido por um script property SEPARADO do WEBHOOK_SECRET do `doPost`:
// `SEGUROS_READ_SECRET` (segredo de leitura isolado do segredo de escrita -
// gere com `openssl rand -hex 16`, do mesmo jeito que o outro). Passos
// adicionais de implantacao (depois dos 7 acima):
//   8. Icone de engrenagem > Propriedades do script > adicione
//      SEGUROS_READ_SECRET com um valor aleatorio novo (NAO reaproveite o
//      WEBHOOK_SECRET).
//   9. Depois de colar este arquivo atualizado no editor, republique:
//      Implantar > Gerenciar implantacoes > editar a implantacao ativa >
//      Nova versao > Implantar (mantem a mesma URL do `/exec`). So salvar o
//      arquivo NAO basta - sem republicar, o `doGet` novo nao fica no ar.
//   10. A rota do painel do gestor chama
//       `<mesma URL do /exec>?secret=<SEGUROS_READ_SECRET>` via GET.
// =========================================================================

const SHEET_NAME = 'Página1';
const ERROS_SHEET_NAME = 'Erros_Webhook';
const FUSO_HORARIO = 'America/Sao_Paulo';

const PLANILHAS = {
  everton: '1R8dMI4OIo-BGPfajWq4tctu5ww4QH3JYh5sXbL32Fd0', // SUPPER MOVIDA 1 - EVERTON
  wesley: '1c_lDJC-63fYYXhHCdo59JIhF83Or_IWIlP24rVzYm8M',  // SUPPER MOVIDA 2 - WESLEY
  william: '1FRfqCU-xyNsB0BGPRcXh4-mQ9_ze0zai-D8OdHSonjg', // SUPPER MOVIDA 3 - WILLIAM
};

// Planilha usada so para o log de erro (ex.: loja sem mapeamento). Reusa a
// do William; troque se preferir uma planilha de controle dedicada.
const PLANILHA_ERROS = PLANILHAS.william;

// Loja (normalizada) -> chave em PLANILHAS. Mantenha em sincronia com o
// valor exato digitado em publicMetadata.loja no Clerk para cada vendedor.
// Alguns apelidos abaixo (marcados) vieram do "Estabelecimento" real do
// relatorio do ViaNuvem (vianuvem-import/), que grafa a mesma loja de jeitos
// diferentes do que os admins digitam no Clerk - confirmado inspecionando
// um export de verdade (ver memoria do projeto).
const LOJA_PARA_PLANILHA = normalizarChavesDoMapa({
  'Americana': 'everton',
  'Campinas Amoreiras': 'everton',
  'Campinas Itapura': 'everton',
  'Campinas Orosimbo': 'everton',
  'Campinas Shop Dom Pedro': 'everton',
  'Campinas - Shopping Dom Pedro': 'everton', // apelido ViaNuvem
  'Seminovos Movida Campinas Shopping Dom Pedro': 'everton', // apelido ViaNuvem
  'Jundiai': 'everton',
  'Praia Grande': 'everton',
  'Seminovos Movida Praia Grande - Sp': 'everton', // apelido ViaNuvem
  'Santos': 'everton',

  'Sao Jose dos Campos': 'wesley',
  'Suzano': 'wesley',
  'Seminovos Movida Suzano': 'wesley', // apelido ViaNuvem (limparNomeLoja nao remove o prefixo "Seminovos")
  'Seminovos Movida Suzano - Sp': 'wesley', // apelido ViaNuvem (variacao com "- SP", como em Praia Grande)
  'Taubate': 'wesley',
  'Guarulhos Timoteo Penteado': 'wesley',
  'Timoteo Penteado': 'wesley', // apelido: planilha "Dados Vendedores por Loja" omite "Guarulhos"
  'Mogi das Cruzes': 'wesley',
  'Aricanduva': 'wesley',
  'Itaim Paulista': 'wesley',

  'Penha': 'william',
  'Radial Leste': 'william',
  'Sao Paulo Radial Leste': 'william', // apelido ViaNuvem
  'Sao Miguel': 'william',
  'Sao Miguel Paulista': 'william', // apelido ViaNuvem
  'Vila Carrao': 'william',
  'Vila Ema': 'william',
  'Vila Guilherme': 'william',
});

function doPost(e) {
  try {
    const segredoEsperado = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
    const segredoRecebido = e.parameter.secret;
    if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
      registrarErro('segredo invalido ou ausente', e);
      return respostaJson({ ok: false });
    }

    const payload = JSON.parse(e.postData.contents);
    const tipo = payload.type;
    if ((tipo !== 'INSERT' && tipo !== 'UPDATE') || payload.table !== 'captacoes' || !payload.record) {
      registrarErro('payload inesperado (nao e INSERT/UPDATE em captacoes)', e);
      return respostaJson({ ok: false });
    }

    const r = payload.record;
    const planilhaId = resolverPlanilhaId(r.loja);
    if (!planilhaId) {
      registrarErro('loja sem planilha mapeada: "' + r.loja + '"', e);
      return respostaJson({ ok: false });
    }

    const aba = getAba(planilhaId, SHEET_NAME);

    // Ordem exata das colunas A-J da aba "Página1". Uma coluna nova "CANAL"
    // foi inserida na posicao B nas 3 planilhas (confirmado visualmente em
    // 09/07/2026 - antes era A-I, sem essa coluna). CANAL vem de
    // `record.canal` ("Indicacao" = formulario do vendedor, "ViaNuvem" =
    // importacao automatica) - mesmo valor que ja fica gravado na coluna
    // `canal` de `captacoes`. E-MAIL e CPF vem preenchidos quando a
    // captacao veio da importacao do ViaNuvem (vendedor_id = "vianuvem");
    // ficam em branco para captacoes do formulario do vendedor (que nao
    // coleta esses 2 campos). STATUS continua em branco (preenchimento
    // manual do time).
    if (tipo === 'INSERT') {
      const dataFormatada = Utilities.formatDate(new Date(r.created_at), FUSO_HORARIO, 'dd/MM/yyyy HH:mm');
      aba.appendRow([
        dataFormatada,       // A DATA
        r.canal || '',       // B CANAL
        r.vendedor_nome,     // C VENDEDOR
        r.loja,              // D LOJA
        r.nome_cliente,      // E NOME
        r.telefone,          // F CELULAR
        r.email || '',       // G E-MAIL
        r.cpf || '',         // H CPF
        r.placa,             // I PLACA
        '',                  // J STATUS (preenchimento manual do time)
      ]);
    } else {
      // UPDATE: acontece quando um vendedor "reivindica" pelo portal um
      // lead que ja existia (ex.: importado do ViaNuvem) - ver
      // registrar_captacao_vendedor no schema.sql. Atualiza a linha
      // existente em vez de duplicar; NAO mexe em DATA (A) nem STATUS (J,
      // preenchimento manual do time). So procura na planilha resolvida
      // pela loja ATUAL do registro - se a loja mudou pra uma planilha
      // diferente da que a linha original esta, nao tenta mover entre
      // planilhas (caso raro), so registra no log de erro pra revisao manual.
      const linha = encontrarLinhaPorPlaca(aba, r.placa);
      if (linha === -1) {
        registrarErro('UPDATE sem linha correspondente (placa pode estar em outra planilha): id ' + (r.id || ''), e);
        return respostaJson({ ok: false });
      }
      aba.getRange(linha, 2, 1, 8).setValues([[
        r.canal || '',       // B CANAL
        r.vendedor_nome,     // C VENDEDOR
        r.loja,              // D LOJA
        r.nome_cliente,      // E NOME
        r.telefone,          // F CELULAR
        r.email || '',       // G E-MAIL
        r.cpf || '',         // H CPF
        r.placa,             // I PLACA
      ]]);
    }

    return respostaJson({ ok: true });
  } catch (err) {
    registrarErro(String(err && err.stack || err), e);
    return respostaJson({ ok: false });
  }
}

// Endpoint de LEITURA do relatorio de seguros (chamado pela rota do painel
// do gestor, fora deste arquivo - ver comentario de cabecalho). Protegido
// por um script property SEPARADO do WEBHOOK_SECRET do `doPost`.
function doGet(e) {
  try {
    const segredoEsperado = PropertiesService.getScriptProperties().getProperty('SEGUROS_READ_SECRET');
    const segredoRecebido = e.parameter && e.parameter.secret;
    if (!segredoEsperado || segredoRecebido !== segredoEsperado) {
      registrarErro('doGet: segredo invalido ou ausente (SEGUROS_READ_SECRET)', e);
      return respostaJson({ ok: false });
    }

    const registros = [];
    Object.keys(PLANILHAS).forEach(function (chave) {
      const aba = getAba(PLANILHAS[chave], SHEET_NAME);
      registros.push.apply(registros, lerSegurosDaAba(aba));
    });

    return respostaJson({ ok: true, registros: registros });
  } catch (err) {
    registrarErro('doGet: ' + String(err && err.stack || err), e);
    return respostaJson({ ok: false });
  }
}

// Le a aba "Pagina1" de UMA planilha e devolve as linhas com STATUS DA
// VENDA preenchido (Emitida/Cancelada/Recusada/Pendente - mantem historico
// completo; o filtro "so Emitida conta" fica por conta de quem monta o
// relatorio, nao deste endpoint). As colunas de seguro (OBS, DATA DA VENDA,
// STATUS DA VENDA, PREMIO LIQUIDO, SEGURADORA, MOTIVO) sao achadas pelo
// NOME do cabecalho da linha 1 - NUNCA por letra fixa - porque so 2 das 3
// planilhas foram conferidas ao vivo; a 3a pode ter posicoes diferentes.
// LOJA e PLACA tambem sao achadas por nome, com fallback pras posicoes
// fixas D/I (indices 3/8, 0-based) so porque essas duas ja fazem parte do
// contrato original A-J documentado no topo deste arquivo.
function lerSegurosDaAba(aba) {
  const ultimaColuna = aba.getLastColumn();
  // Os cabecalhos das colunas de seguro (K-P) sao lidos da LINHA 1 - repare
  // que isso e diferente do cabecalho A-J documentado no topo deste arquivo
  // (linha 2). Confirmado ao vivo nas planilhas reais: a linha 1 e onde o
  // time de seguros escreveu os nomes dessas colunas extras.
  const cabecalhos = aba.getRange(1, 1, 1, ultimaColuna).getValues()[0];

  const colLoja = acharColunaPorNome(cabecalhos, ['loja'], 3);
  const colPlaca = acharColunaPorNome(cabecalhos, ['placa'], 8);
  const colObs = acharColunaPorNome(cabecalhos, ['obs']);
  const colDataVenda = acharColunaPorNome(cabecalhos, ['data da venda']);
  const colStatusVenda = acharColunaPorNome(cabecalhos, ['status da venda']);
  const colPremioLiquido = acharColunaPorNome(cabecalhos, ['premio liquido']);
  const colSeguradora = acharColunaPorNome(cabecalhos, ['seguradora']);
  const colMotivo = acharColunaPorNome(cabecalhos, ['motivo']);

  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2 || colStatusVenda === -1) return [];

  // NAO usar linha 3 aqui (diferente de encontrarLinhaPorPlaca/doPost, que
  // assumem cabecalho na linha 2 e dados a partir da linha 3): conferido AO
  // VIVO nas planilhas reais que a linha 1 e o cabecalho de verdade e os
  // dados comecam na linha 2. Ou seja, o comentario historico no topo deste
  // arquivo ("linha 2 = cabecalho, dados a partir da linha 3") esta
  // desatualizado/errado em relacao aos dados reais - possivel bug latente
  // em encontrarLinhaPorPlaca (UPDATE nunca acharia uma placa que esteja na
  // linha 2), mas corrigir isso e fora do escopo deste endpoint novo; so
  // reportado, nao alterado aqui.
  const dados = aba.getRange(2, 1, ultimaLinha - 1, ultimaColuna).getValues();
  const registros = [];
  dados.forEach(function (linha) {
    const statusVenda = linha[colStatusVenda];
    if (statusVenda === '' || statusVenda == null) return;

    registros.push({
      placa: colPlaca !== -1 ? linha[colPlaca] : '',
      loja: colLoja !== -1 ? linha[colLoja] : '',
      obs: colObs !== -1 ? linha[colObs] : '',
      dataVenda: colDataVenda !== -1 ? linha[colDataVenda] : '',
      statusVenda: statusVenda,
      premioLiquido: colPremioLiquido !== -1 ? linha[colPremioLiquido] : '',
      seguradora: colSeguradora !== -1 ? linha[colSeguradora] : '',
      motivo: colMotivo !== -1 ? linha[colMotivo] : '',
    });
  });
  return registros;
}

// Acha o indice (0-based) de uma coluna pelo NOME do cabecalho, comparando
// por igualdade EXATA do texto normalizado (normalizarTexto - mesma funcao
// usada pra loja) - nunca por "contem", pra nao casar substring por
// acidente (ex.: cabecalho "DATA" da coluna A batendo com "DATA DA VENDA").
// `indiceFixo` (opcional, 0-based) e usado como fallback SO pra LOJA/PLACA -
// ver comentario de lerSegurosDaAba.
function acharColunaPorNome(cabecalhos, nomesCandidatos, indiceFixo) {
  const normalizados = cabecalhos.map(normalizarTexto);
  for (let i = 0; i < nomesCandidatos.length; i++) {
    const idx = normalizados.indexOf(nomesCandidatos[i]);
    if (idx !== -1) return idx;
  }
  return typeof indiceFixo === 'number' ? indiceFixo : -1;
}

// Procura pela placa na coluna I (indice 9) a partir da linha 3 (dados
// comecam depois do cabecalho na linha 2). Retorna o numero da linha (1-based,
// pronto pra usar em getRange) ou -1 se nao encontrar.
function encontrarLinhaPorPlaca(aba, placa) {
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 3) return -1;
  const placas = aba.getRange(3, 9, ultimaLinha - 2, 1).getValues();
  for (let i = 0; i < placas.length; i++) {
    if (placas[i][0] === placa) return i + 3;
  }
  return -1;
}

function resolverPlanilhaId(loja) {
  const chave = LOJA_PARA_PLANILHA[normalizarTexto(loja)];
  return chave ? PLANILHAS[chave] : null;
}

// Remove acentos, baixa a caixa e tira um eventual prefixo "movida -", para
// tolerar as variacoes de escrita que aparecem nas planilhas hoje (ex.:
// "MOVIDA - CAMPINAS ITAPURA" e "Campinas Itapura" normalizam igual).
function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^movida\s*-?\s*/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizarChavesDoMapa(mapa) {
  const normalizado = {};
  Object.keys(mapa).forEach((chave) => {
    normalizado[normalizarTexto(chave)] = mapa[chave];
  });
  return normalizado;
}

// Roda uma vez manualmente (menu Executar) para criar a aba de log de erro.
// Nao cria nem altera as abas "Página1" das 3 planilhas - elas ja existem
// com dados reais. Autoriza o script a acessar as 3 planilhas.
function setupSheet() {
  Object.keys(PLANILHAS).forEach((chave) => getAba(PLANILHAS[chave], SHEET_NAME));
  getOuCriarAba(PLANILHA_ERROS, ERROS_SHEET_NAME, ['Data/Hora', 'Erro', 'ID do registro (se disponível)']);
}

function getAba(spreadsheetId, nomeAba) {
  const planilha = SpreadsheetApp.openById(spreadsheetId);
  const aba = planilha.getSheetByName(nomeAba);
  if (!aba) {
    throw new Error('Aba "' + nomeAba + '" nao encontrada na planilha ' + spreadsheetId);
  }
  return aba;
}

function getOuCriarAba(spreadsheetId, nome, cabecalho) {
  const planilha = SpreadsheetApp.openById(spreadsheetId);
  let aba = planilha.getSheetByName(nome);
  if (!aba) {
    aba = planilha.insertSheet(nome);
    aba.appendRow(cabecalho);
    aba.setFrozenRows(1);
  }
  return aba;
}

// Nunca gravar nome/telefone/placa aqui: so metadados tecnicos, para nao
// criar uma segunda copia de dado pessoal sem controle de acesso/retencao.
function registrarErro(mensagem, e) {
  let idRegistro = '';
  try {
    const payload = JSON.parse(e.postData.contents);
    idRegistro = (payload && payload.record && payload.record.id) || '';
  } catch (_) {
    // payload nao era JSON valido; segue sem id.
  }
  getOuCriarAba(PLANILHA_ERROS, ERROS_SHEET_NAME, ['Data/Hora', 'Erro', 'ID do registro (se disponível)'])
    .appendRow([new Date(), mensagem, idRegistro]);
}

function respostaJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
