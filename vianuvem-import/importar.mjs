// =========================================================================
// Importa leads do Unico Auto / ViaNuvem para a tabela `captacoes` do
// Captacao Movida. Pensado pra rodar 1x/hora via cron (ver README.md).
//
// Fluxo:
//   1. Login via Playwright (unico jeito de passar pelo reCAPTCHA da tela
//      de login - ver conversa/memoria do projeto: e um form comum com
//      reCAPTCHA v3 invisivel, sem desafio pra "resolver"). Tambem concede
//      permissao de geolocalizacao de proposito - o site pede isso como
//      parte do login e, sem responder, a pagina trava esperando pra sempre.
//   2. Clica em "Exportar > Processos" NA TELA (nao replica a chamada por
//      fora com os cookies extraidos - tentamos isso e o endpoint voltava
//      vazio sem erro, parece depender de estado que so existe navegando
//      normalmente) e captura a resposta real que o proprio site recebe.
//   3. Baixa o relatorio (planilha) do link assinado retornado.
//   4. Pra cada linha: normaliza a placa, pula se ja existe em `captacoes`
//      (de QUALQUER origem - formulario ou importacao anterior), senao
//      insere com vendedor_id = "vianuvem" (fixo - por isso o registro so
//      fica visivel ao gestor via RLS) mas vendedor_nome = a coluna fixa
//      "Aberto por" do relatorio (o vendedor real que abriu o processo no
//      ViaNuvem), com fallback pro texto antigo se essa coluna vier vazia.
//
// O insert na tabela dispara sozinho o Database Webhook ja existente, que
// roteia pra planilha certa do Google Sheets - nada aqui mexe nisso.
//
// Formato do arquivo exportado (CONFIRMADO contra um export real de 33
// processos, 2026-07 - ver memoria do projeto): colunas 0-11 tem cabecalho
// fixo normal; colunas 12+ sao pares (rotulo, valor) sem cabecalho na linha
// 1, onde o rotulo e uma string dentro da propria linha (varia por Tipo de
// Processo). Nao ha fixture de teste com esse arquivo no repositorio de
// proposito - e dado pessoal real, nunca commitar um export de verdade.
//
// JA CONFIRMADO com login e senha reais (2026-07): autenticacao completa,
// clique em Exportar > Processos, e resposta tanto sincrona quanto
// assincrona (async:true) do endpoint de relatorio.
//
// ATENCAO - pegadinha real que ja aconteceu: se a senha tiver "#", ela
// PRECISA estar entre aspas no .env (ver .env.example) - sem aspas, o
// dotenv trata tudo depois do "#" como comentario e corta a senha em
// silencio, sem erro nenhum (o login so falha de forma misteriosa).
//
// LIMITACAO AINDA NAO CONFIRMADA:
//   - Paginacao: assumido que o relatorio exportado ja traz todas as linhas
//     de uma vez (nao paginado). Se "Processos que atuo" crescer muito,
//     verifique se falta paginar.
// =========================================================================

import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import {
  normalizarPlaca,
  limparNomeLoja,
  limparNomeVendedor,
  mascararPlaca,
} from "./lib/normalizar.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import WebSocket from "ws";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const URL_LOGIN = "https://app.vianuvem.com.br/auto/login";

// O relatorio exportado tem duas partes bem diferentes (confirmado
// inspecionando um export real - ver memoria do projeto):
//   - Colunas 0-11: cabecalho fixo normal na linha 1 (ID Processo, Data da
//     Abertura, Aberto por, Tipo de Processo, Estabelecimento, Situacao...).
//   - Colunas 12 em diante: SEM cabecalho na linha 1. Sao pares
//     (rotulo, valor) que se repetem a cada 2 colunas, e o texto do rotulo
//     e uma STRING DENTRO DA PROPRIA LINHA (varia por "Tipo de Processo",
//     ja que cada tipo tem campos customizados diferentes - e exatamente o
//     que aparece ao expandir um processo na tela: "Nome do cliente:",
//     "Cpf:", "E-mail do cliente:", "Celular do cliente:", "Placa do
//     veiculo:" etc.). Por isso o campo certo e achado varrendo os pares de
//     cada linha, nao por indice fixo de coluna.
export const CAMPOS_DINAMICOS = {
  numeroProposta: ["numero da proposta", "numero proposta", "proposta"],
  nomeCliente: ["nome do cliente", "cliente"],
  cpf: ["cpf"],
  email: ["e-mail do cliente", "email do cliente", "e-mail", "email"],
  celular: ["celular do cliente", "celular", "telefone"],
  placa: ["placa do veiculo", "placa"],
};
export const COLUNAS_FIXAS = {
  estabelecimento: ["estabelecimento"],
  // Nome de quem abriu o processo no ViaNuvem - o vendedor real. Usado como
  // vendedor_nome no lugar do texto fixo "ViaNuvem (importacao automatica)".
  abertoPor: ["aberto por"],
};
const PRIMEIRA_COLUNA_DINAMICA = 12;

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Prioriza IGUALDADE exata sobre "contem", senao "ID Estabelecimento" bate
// antes de "Estabelecimento" (mesma substring) - bug real encontrado ao
// testar contra um export de verdade (ver memoria do projeto).
export function acharColunaFixa(headers, candidatos) {
  const normalizados = headers.map(normalizarTexto);
  for (const candidato of candidatos) {
    const idxExato = normalizados.findIndex((h) => h === candidato);
    if (idxExato !== -1) return idxExato;
  }
  for (const candidato of candidatos) {
    const idxParcial = normalizados.findIndex((h) => h.includes(candidato));
    if (idxParcial !== -1) return idxParcial;
  }
  return -1;
}

// Varre os pares (rotulo, valor) de uma linha (colunas 12+) e monta um mapa
// rotulo-normalizado -> valor, pra cada campo dinamico ser achado por nome.
function extrairCamposDinamicos(linhaArray) {
  const campos = {};
  for (let i = PRIMEIRA_COLUNA_DINAMICA; i < linhaArray.length - 1; i += 2) {
    const rotulo = linhaArray[i];
    const valor = linhaArray[i + 1];
    if (rotulo != null && String(rotulo).trim() !== "") {
      campos[normalizarTexto(rotulo)] = valor;
    }
  }
  return campos;
}

function acharCampoDinamico(campos, candidatos) {
  const chaves = Object.keys(campos);
  for (const candidato of candidatos) {
    const chave = chaves.find((k) => k.includes(candidato));
    if (chave != null) return campos[chave];
  }
  return null;
}

// Relativo ao proprio arquivo (funciona tanto rodando local quanto dentro
// do container Docker, onde WORKDIR e /app - antes estava fixo em "/app/
// debug", o que so existia dentro do container).
const PASTA_DEBUG = join(dirname(fileURLToPath(import.meta.url)), "debug");

// Quando algo falha, tira um print e pega o texto visivel da tela (nunca a
// senha, que so existe no campo de input, nao no texto renderizado) para
// dar pra diagnosticar de longe sem precisar adivinhar. Salva em
// PASTA_DEBUG, que o docker-compose monta como volume pra sobreviver ao
// --rm do container. `rotulo` distingue o print de falha de login do de
// falha de exportacao.
// `rastreamento` (opcional) e o objeto devolvido por iniciarRastreamentoDePagina
// (console/erros/requisicoes coletados desde a abertura da pagina) - sem ele,
// so tira o print e o texto visivel (comportamento antigo). Grava um JSON a
// parte com o rastreamento completo em vez de embutir tudo na mensagem de
// erro (que ja e longa por causa do log do Playwright) - so a contagem e o
// caminho do arquivo vao na string devolvida.
async function capturarDiagnosticoDeFalha(page, rotulo, rastreamento) {
  try {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(PASTA_DEBUG, { recursive: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const caminhoPrint = `${PASTA_DEBUG}/${rotulo}-${carimbo}.png`;
    await page.screenshot({ path: caminhoPrint, fullPage: true });

    const textoTela = await page.evaluate(() => document.body.innerText).catch(() => "");
    const textoResumido = textoTela.replace(/\s+/g, " ").trim().slice(0, 400);

    let resumoRastreamento = "";
    if (rastreamento) {
      const caminhoJson = `${PASTA_DEBUG}/${rotulo}-${carimbo}.json`;
      const pendentes = [...rastreamento.requisicoesPendentes.keys()];
      writeFileSync(
        caminhoJson,
        JSON.stringify(
          {
            console: rastreamento.mensagensConsole,
            errosDePagina: rastreamento.errosDePagina,
            requisicoesFalhas: rastreamento.requisicoesFalhas,
            requisicoesPendentes: pendentes,
          },
          null,
          2
        )
      );
      resumoRastreamento =
        ` Rastreamento em ${caminhoJson} (${rastreamento.mensagensConsole.length} mensagens de console, ` +
        `${rastreamento.errosDePagina.length} erros de pagina, ${rastreamento.requisicoesFalhas.length} ` +
        `requisicoes falhas, ${pendentes.length} ainda pendentes).`;
    }

    return `Print salvo em ${caminhoPrint}. Texto visivel na tela: "${textoResumido}".${resumoRastreamento}`;
  } catch (err) {
    return `(nao foi possivel capturar diagnostico: ${err})`;
  }
}

// Liga listeners na pagina ANTES de qualquer navegacao (console/erro/rede nao
// sao retroativos no Playwright - se ligar so na hora da falha, perde tudo
// que ja aconteceu). Usado pra descobrir a causa real de "Exportar" ficar
// disabled por 60s inteiros sem nenhum overlay visivel na tela (ver
// capturarDiagnosticoDeFalha) - ex.: erro JS no widget que habilita o botao,
// ou uma chamada de API/WebSocket que nunca resolve em modo headless.
function iniciarRastreamentoDePagina(page) {
  const mensagensConsole = [];
  const errosDePagina = [];
  const requisicoesFalhas = [];
  const requisicoesPendentes = new Map();

  page.on("console", (msg) => {
    if (mensagensConsole.length >= 50) return;
    mensagensConsole.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    if (errosDePagina.length >= 50) return;
    errosDePagina.push(String(err));
  });
  page.on("request", (req) => {
    if (requisicoesPendentes.size >= 200) return;
    requisicoesPendentes.set(req, req.url());
  });
  page.on("requestfinished", (req) => requisicoesPendentes.delete(req));
  page.on("requestfailed", (req) => {
    requisicoesPendentes.delete(req);
    if (requisicoesFalhas.length >= 50) return;
    requisicoesFalhas.push(`${req.url()} - ${req.failure()?.errorText || "erro desconhecido"}`);
  });

  return { mensagensConsole, errosDePagina, requisicoesFalhas, requisicoesPendentes };
}

// Clica em "Exportar" > "Processos" na tela de verdade e captura a resposta
// real que o proprio site recebe (em vez de replicar a chamada por fora com
// os cookies extraidos - tentamos isso primeiro e voltou sempre com
// fullSignedURL vazio, sem erro, mesmo com sessao valida; o endpoint parece
// depender de algum estado que so existe navegando/clicando na tela
// normalmente, entao deixamos o proprio Playwright fazer o clique real).
// Fecha avisos/modais que o proprio site as vezes mostra por cima da tela
// (banner de cookies, avisos de produto) ANTES de tentar exportar - visto em
// producao em 22/09/2026: um modal de aviso ("Descontinuacao do Unico Auto")
// cobrindo o widget do qual o botao "Exportar" depende pra habilitar, o que
// fazia o clique estourar os 60s inteiros com o botao sempre "disabled" (nao
// era sobreposicao de clique como o overlay do HubSpot - o proprio atributo
// disabled nunca saia enquanto o modal estava na tela). Como cada execucao
// do Playwright abre um contexto novo (sem cookie de "ja vi esse aviso"),
// esses avisos tendem a aparecer em TODA execucao, entao isso roda sempre,
// nao so na primeira vez. Cada tentativa e curta e silenciosa (nunca lanca)
// pra nao quebrar quando o site nao tiver nenhum desses na tela.
async function fecharAvisosBloqueantes(page) {
  await page
    .getByRole("button", { name: /aceitar/i })
    .click({ timeout: 3000 })
    .catch(() => {});
  await page
    .getByRole("button", { name: /fechar|close/i })
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
}

// Remove do DOM qualquer overlay/widget de marketing do HubSpot que esteja
// cobrindo o botao (id comeca com "hs-web-interactives" ou
// "hs-interactives-modal-overlay", visto em producao 25/08/2026). Ignora
// silenciosamente se nao existir - so limpa quando ha algo pra limpar.
async function removerOverlayHubspot(page) {
  await page
    .evaluate(() => {
      document
        .querySelectorAll('[id^="hs-web-interactives"], [id^="hs-interactives-modal-overlay"]')
        .forEach((el) => el.remove());
    })
    .catch(() => {});
}

async function clicarExportarProcessos(page) {
  // 30s dava timeout em producao com o site so um pouco mais lento (visto
  // em 3 execucoes seguidas do cron) mesmo com o clique tendo saido normal -
  // 60s da a mesma folga que ja usamos no polling do relatorio assincrono.
  const respostaPromise = page.waitForResponse(
    (r) => r.url().includes("search/report/workflows") && r.request().method() === "POST",
    { timeout: 180000 }
  );
  // Sem isso, uma rejeicao dessa promise ENQUANTO os cliques abaixo ainda
  // estao em andamento (ex.: pagina/contexto fecha no meio do caminho) conta
  // como unhandled rejection pro Node e mata o processo inteiro antes do
  // "await respostaPromise" e do try/catch em autenticarEBaixarSignedUrl -
  // visto em producao (24/08/2026) como "Target page, context or browser has
  // been closed" sem print de diagnostico. O catch vazio so marca a promise
  // como tratada; o await abaixo continua lancando o erro normalmente.
  respostaPromise.catch(() => {});
  // Um popup de marketing do HubSpot (#hs-interactives-modal-overlay) cobre
  // o botao de tempos em tempos. `force: true` (tentado antes, 25/08/2026)
  // NAO resolve: ele so ignora a checagem de estabilidade do Playwright, mas
  // o navegador ainda entrega o clique de verdade pro elemento que esta
  // fisicamente por cima - entao "Exportar" nunca abria o menu de verdade e
  // o "Processos" seguinte dava timeout esperando um item que nunca
  // aparecia. Removendo o overlay do DOM (decorativo, sem relacao com o
  // fluxo de exportacao) antes de cada clique, o clique normal (sem force)
  // chega no botao real.
  await removerOverlayHubspot(page);
  await fecharAvisosBloqueantes(page);
  // O botao "Exportar" fica com o atributo disabled de verdade (nao e
  // sobreposicao de clique) enquanto algum widget da tela ainda esta
  // carregando - e os 3 timeouts tentados antes (30s, depois 60s) sempre
  // estouravam com o botao AINDA disabled no ultimo instante (visto no log
  // de retry do Playwright: 500ms entre tentativas, "element is not
  // enabled" ate o fim exato dos 60s) - ou seja, o problema nao era
  // overlay nenhum, era so precisar de mais tempo. Separado do .click() de
  // proposito: espera ativamente o disabled sumir (com log do tempo real
  // que levou, pra medir de verdade em vez de so aumentar o timeout as
  // cegas de novo) e SO DEPOIS clica, com um timeout curto (ja deveria
  // estar pronto pro clique).
  const inicioEspera = Date.now();
  await page.waitForFunction(
    () => {
      const botoes = [...document.querySelectorAll('button[data-testid*="btn-export-workflow"]')];
      return botoes.some((b) => !b.disabled);
    },
    { timeout: 180000, polling: 500 }
  );
  console.log(
    `[vianuvem-import] Botao Exportar habilitou apos ${Math.round((Date.now() - inicioEspera) / 1000)}s de espera.`
  );
  await page.getByRole("button", { name: "Exportar" }).click({ timeout: 10000 });
  // SO remove overlay aqui, NAO chama fecharAvisosBloqueantes: ela aperta
  // Escape, que fecha o menu suspenso do "Exportar" que acabou de abrir -
  // bug real visto em producao (22/09/2026): o clique em Exportar "dava
  // certo" sem erro nenhum, mas "Processos" nunca aparecia porque o proprio
  // Escape fechava o menu antes do clique seguinte. O aviso/modal que
  // fecharAvisosBloqueantes trata so pode aparecer ANTES do menu abrir.
  await removerOverlayHubspot(page);
  await page.getByRole("button", { name: "Processos" }).click({ timeout: 60000 });
  const resposta = await respostaPromise;
  return resposta.json();
}

// fullSignedURL e um link de acesso temporario (mesmo cuidado de qualquer
// segredo do projeto) - nunca loga o valor, so se esta presente ou nao.
function resumoRespostaRelatorio(resp) {
  return JSON.stringify({ ...resp, fullSignedURL: resp.fullSignedURL ? "[presente]" : resp.fullSignedURL });
}

// Preenche o formulario e CONFERE se o valor ficou de verdade. O site e uma
// SPA: como o goto usa "domcontentloaded", o React pode hidratar/re-renderizar
// o formulario DEPOIS do fill e limpar o que foi digitado - o campo existe no
// DOM, o fill nao da erro, mas o submit vai vazio. Diagnosticado em producao
// (07/08/2026): prints de falha mostravam a tela de login intacta, sem nenhuma
// mensagem de erro do site e sem reCAPTCHA, com os 30s do waitForURL inteiros
// estourando - ou seja, o submit nunca foi processado. Por isso: espera o
// campo ficar editavel, digita, e re-digita se o valor tiver evaporado.
async function preencherCredenciais(page, usuario, senha) {
  const MAX_TENTATIVAS_FILL = 3;
  const campoUsuario = page.locator("#username");
  const campoSenha = page.locator("#password");

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_FILL; tentativa += 1) {
    // O locator.fill() ja espera o campo estar visivel e editavel (o
    // page.fill() antigo tambem, mas sem o loop de conferencia abaixo).
    await campoUsuario.waitFor({ state: "visible", timeout: 30000 });
    await campoUsuario.fill(usuario);
    await campoSenha.fill(senha);

    // Folga curta pra uma re-renderizacao tardia se manifestar AQUI (onde da
    // pra corrigir) em vez de so no submit (onde a falha fica muda).
    await page.waitForTimeout(500);

    // Compara so o TAMANHO da senha - nunca o valor, que nao pode vazar pra
    // log nem pra mensagem de erro (LGPD/segredo).
    const usuarioOk = (await campoUsuario.inputValue()) === usuario;
    const senhaOk = (await campoSenha.inputValue()).length === senha.length;
    if (usuarioOk && senhaOk) return;

    console.warn(
      `[vianuvem-import] Campos de login limpos apos digitar (tentativa ${tentativa}/${MAX_TENTATIVAS_FILL}) - re-digitando.`
    );
  }

  throw new Error(
    "Nao foi possivel preencher as credenciais: o formulario limpou os campos " +
      `apos ${MAX_TENTATIVAS_FILL} tentativas.`
  );
}

// Clica em Entrar e confirma que o submit REALMENTE saiu pela rede. Um clique
// que chega antes do handler do React estar ligado nao faz nada, e sem essa
// checagem a falha fica indistinguivel de "senha errada". Filtra pelo host do
// proprio site porque a pagina dispara POSTs de rastreamento (Facebook,
// LinkedIn) que nao tem nada a ver com o login. Se o clique nao produzir
// requisicao, tenta Enter no campo de senha como segundo caminho.
async function submeterLogin(page) {
  const host = new URL(URL_LOGIN).host;
  const esperarPost = () =>
    page
      .waitForRequest((r) => r.method() === "POST" && new URL(r.url()).host === host, {
        timeout: 15000,
      })
      .then(() => true)
      .catch(() => false);

  const botao = page.locator('button[type="submit"]');
  await botao.waitFor({ state: "visible", timeout: 30000 });

  let postDoLogin = esperarPost();
  await botao.click();
  if (await postDoLogin) return true;

  console.warn(
    "[vianuvem-import] Clique em Entrar nao gerou requisicao - tentando Enter no campo de senha."
  );
  postDoLogin = esperarPost();
  await page.locator("#password").press("Enter");
  return postDoLogin;
}

async function autenticarEBaixarSignedUrl(usuario, senha) {
  // VIANUVEM_HEADLESS=false roda com o navegador visivel (util pra depurar
  // localmente, ex.: descobrir se um desafio do reCAPTCHA aparece). Em
  // producao (cron/servidor sem tela) deixe sem essa variavel = headless.
  const modoHeadless = process.env.VIANUVEM_HEADLESS !== "false";
  const browser = await chromium.launch({ headless: modoHeadless, slowMo: modoHeadless ? 0 : 150 });
  // O ViaNuvem pede permissao de geolocalizacao como parte do login (visto
  // ao vivo: um popup nativo do navegador aparece e, sem ninguem pra clicar
  // "Permitir", a pagina fica esperando pra sempre e acaba travando/
  // resetando pro login - bate com a falha identica em headless e headed).
  // Concede de proposito, com uma coordenada de Sao Paulo (sede da
  // operacao) em vez de deixar pendente ou em (0,0).
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    permissions: ["geolocation"],
    geolocation: { latitude: -23.5505, longitude: -46.6333 },
  });
  const page = await context.newPage();
  const rastreamento = iniciarRastreamentoDePagina(page);

  try {
    // "networkidle" nunca e alcancado nesse site - ele carrega pixels de
    // rastreamento (Facebook, LinkedIn Ads, LaunchDarkly) que continuam
    // fazendo requisicoes em segundo plano indefinidamente, entao a rede
    // nunca "para" de verdade. "domcontentloaded"/"load" bastam pro
    // formulario de login estar pronto - confirmado com erro real de
    // timeout em producao (ver memoria do projeto).
    await page.goto(URL_LOGIN, { waitUntil: "domcontentloaded" });
    await preencherCredenciais(page, usuario, senha);
    const submeteu = await submeterLogin(page);

    // Espera ATIVAMENTE sair de /login (login real pode demorar mais que um
    // tempo fixo curto pra processar+redirecionar) em vez de um sleep cego -
    // sai assim que a URL mudar, ou desiste no timeout. 10s se mostrou curto
    // demais em producao (site mais lento em alguns horarios derrubava um
    // login valido como se tivesse falhado) - 30s da mais folga sem custar
    // muito quando o login e rapido, ja que sai assim que a URL mudar.
    await page
      .waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 })
      .catch(() => {});

    const url = page.url();
    if (url.includes("/login")) {
      const diagnostico = await capturarDiagnosticoDeFalha(page, "falha-login", rastreamento);
      // Diz se o submit chegou a sair pela rede: se NAO saiu, o problema e a
      // pagina (nao reagiu ao clique/Enter); se saiu e continuamos no /login,
      // ai sim e o site recusando (senha, verificacao adicional, reCAPTCHA).
      throw new Error(
        `Login nao concluido (ainda na tela de login; submit enviado ao site: ${
          submeteu ? "sim" : "nao"
        }${
          submeteu
            ? " - possivel senha errada, verificacao adicional, ou o reCAPTCHA " +
              "pontuou a sessao como suspeita"
            : " - a pagina nao reagiu ao clique/Enter, provavel corrida com a " +
              "renderizacao do formulario"
        }). ${diagnostico}`
      );
    }

    console.log("[vianuvem-import] Login OK. Clicando em Exportar > Processos...");
    await fecharAvisosBloqueantes(page);

    let dadosResposta;
    try {
      dadosResposta = await clicarExportarProcessos(page);
    } catch (err) {
      // Sem isso, um timeout aqui (ex.: site lento nesse endpoint) virava
      // uma falha muda - nenhum print, so o erro cru do Playwright no log.
      const diagnostico = await capturarDiagnosticoDeFalha(page, "falha-clique-exportar", rastreamento);
      throw new Error(`Falha ao clicar em Exportar > Processos: ${err.message}. ${diagnostico}`);
    }
    let tentativas = 0;
    const MAX_TENTATIVAS = 24; // 24 x 5s = 2 minutos
    console.log(`[vianuvem-import] Resposta inicial: ${resumoRespostaRelatorio(dadosResposta)}`);

    // Se vier assincrono, continua ouvindo a MESMA tela por novas respostas
    // desse endpoint (a propria SPA deve pollar sozinha se for o caso) em
    // vez de nos re-perguntarmos por fora - assim reaproveitamos qualquer
    // polling que o site ja faca, sem reinventar o contrato.
    while (dadosResposta.async && !dadosResposta.fullSignedURL && tentativas < MAX_TENTATIVAS) {
      const proxima = await page
        .waitForResponse(
          (r) => r.url().includes("search/report/workflows") && r.request().method() === "POST",
          { timeout: 5000 }
        )
        .then((r) => r.json())
        .catch(() => null);
      tentativas += 1;
      if (proxima) {
        dadosResposta = proxima;
        console.log(
          `[vianuvem-import] Tentativa ${tentativas}/${MAX_TENTATIVAS}: ${resumoRespostaRelatorio(dadosResposta)}`
        );
      }
    }

    if (!dadosResposta.fullSignedURL) {
      const diagnostico = await capturarDiagnosticoDeFalha(page, "falha-export", rastreamento);
      throw new Error(
        `Relatorio nao ficou pronto a tempo. Ultima resposta: ${resumoRespostaRelatorio(dadosResposta)}. ${diagnostico}`
      );
    }

    return dadosResposta.fullSignedURL;
  } finally {
    await browser.close();
  }
}

// Retorna { headers, linhas } como arrays crus (nao objetos por header),
// porque as colunas 12+ nao tem cabeçalho fixo (ver CAMPOS_DINAMICOS acima).
async function baixarLinhas(signedUrl) {
  const resposta = await fetch(signedUrl);
  if (!resposta.ok) {
    throw new Error(`Falha ao baixar relatorio: HTTP ${resposta.status}`);
  }
  const buffer = Buffer.from(await resposta.arrayBuffer());
  const planilha = XLSX.read(buffer, { type: "buffer" });
  const primeiraAba = planilha.SheetNames[0];
  const [headers, ...linhas] = XLSX.utils.sheet_to_json(planilha.Sheets[primeiraAba], {
    header: 1,
    defval: null,
  });
  return { headers, linhas };
}

export function mapearLinha(linhaArray, colEstabelecimento, colAbertoPor) {
  const campos = extrairCamposDinamicos(linhaArray);
  const col = (campo) => acharCampoDinamico(campos, CAMPOS_DINAMICOS[campo]);
  const abertoPor =
    colAbertoPor === -1 ? null : limparNomeVendedor(linhaArray[colAbertoPor]);
  return {
    numeroProposta: col("numeroProposta"),
    nomeCliente: col("nomeCliente"),
    cpf: col("cpf"),
    email: col("email"),
    telefone: col("celular"),
    placa: normalizarPlaca(col("placa") || ""),
    loja: colEstabelecimento === -1 ? null : limparNomeLoja(linhaArray[colEstabelecimento]),
    vendedorNome: abertoPor,
  };
}

async function importar() {
  const { VIANUVEM_USUARIO, VIANUVEM_SENHA, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } =
    process.env;

  if (!VIANUVEM_USUARIO || !VIANUVEM_SENHA || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Faltam variaveis de ambiente. Confira .env contra .env.example."
    );
  }

  // O cliente do Supabase cria um RealtimeClient internamente mesmo sem
  // usarmos realtime, e ele exige WebSocket nativo (Node 22+). A imagem do
  // Playwright pode vir com uma versao mais antiga de Node - passar o `ws`
  // explicitamente evita depender de qual Node vem em cada imagem base.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    realtime: { transport: WebSocket },
  });

  console.log("[vianuvem-import] Autenticando e exportando processos...");
  const signedUrl = await autenticarEBaixarSignedUrl(VIANUVEM_USUARIO, VIANUVEM_SENHA);

  console.log("[vianuvem-import] Baixando e lendo planilha...");
  const { headers, linhas } = await baixarLinhas(signedUrl);
  if (linhas.length === 0) {
    console.log("[vianuvem-import] Nenhum processo encontrado.");
    return;
  }
  const colEstabelecimento = acharColunaFixa(headers, COLUNAS_FIXAS.estabelecimento);
  const colAbertoPor = acharColunaFixa(headers, COLUNAS_FIXAS.abertoPor);

  let importados = 0;
  let ignorados = 0;

  for (const linhaBruta of linhas) {
    const lead = mapearLinha(linhaBruta, colEstabelecimento, colAbertoPor);

    if (!lead.placa || !lead.nomeCliente || !lead.telefone) {
      console.warn(
        `[vianuvem-import] Linha sem placa/nome/telefone, pulando (proposta ${lead.numeroProposta}).`
      );
      ignorados += 1;
      continue;
    }

    // Dedup por placa em TODA a tabela (qualquer origem) - decisao do
    // projeto: se um vendedor ja indicou esse veiculo, ou se essa proposta
    // ja foi importada antes, nao duplica.
    const { data: existente, error: erroBusca } = await supabase
      .from("captacoes")
      .select("id")
      .eq("placa", lead.placa)
      .limit(1)
      .maybeSingle();

    if (erroBusca) {
      console.error(
        `[vianuvem-import] Erro ao checar placa ${mascararPlaca(lead.placa)}:`,
        erroBusca.message
      );
      continue;
    }
    if (existente) {
      ignorados += 1;
      continue;
    }

    const { error: erroInsercao } = await supabase.from("captacoes").insert({
      vendedor_id: "vianuvem",
      vendedor_nome: lead.vendedorNome || "ViaNuvem (importacao automatica)",
      loja: lead.loja,
      nome_cliente: lead.nomeCliente,
      telefone: lead.telefone,
      placa: lead.placa,
      cpf: lead.cpf,
      email: lead.email,
      canal: "ViaNuvem",
    });

    if (erroInsercao) {
      console.error(
        `[vianuvem-import] Erro ao inserir placa ${mascararPlaca(lead.placa)}:`,
        erroInsercao.message
      );
      continue;
    }
    importados += 1;
  }

  console.log(
    `[vianuvem-import] Concluido: ${importados} importado(s), ${ignorados} ja existente(s)/invalido(s).`
  );
}

// So roda de verdade quando executado direto (node importar.mjs / cron) -
// nao quando este arquivo e importado por outro script (ex.: um teste local
// que reaproveita mapearLinha/acharColunaFixa sem credenciais).
if (import.meta.url === `file://${process.argv[1]}`) {
  importar().catch((err) => {
    console.error("[vianuvem-import] Falha na execucao:", err);
    process.exitCode = 1;
  });
}
