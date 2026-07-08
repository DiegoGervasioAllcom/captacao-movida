// =========================================================================
// Importa leads do Unico Auto / ViaNuvem para a tabela `captacoes` do
// Captacao Movida. Pensado pra rodar 1x/hora via cron (ver README.md).
//
// Fluxo:
//   1. Login via Playwright (unico jeito de passar pelo reCAPTCHA da tela
//      de login - ver conversa/memoria do projeto: e um form comum com
//      reCAPTCHA v3 invisivel, sem desafio pra "resolver").
//   2. Extrai os cookies de sessao e derruba o navegador - o resto e so
//      chamada HTTP direta na API interna (mais leve e rapido).
//   3. Chama o endpoint de exportacao ("Processos que atuo") e baixa o
//      relatorio (planilha) do link assinado.
//   4. Pra cada linha: normaliza a placa, pula se ja existe em `captacoes`
//      (de QUALQUER origem - formulario ou importacao anterior), senao
//      insere com vendedor_id/vendedor_nome = "vianuvem".
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
// LIMITACOES AINDA NAO CONFIRMADAS (o export de teste tinha so 33 linhas,
// um unico lote - nao deu pra validar isso sem rodar de verdade por mais
// tempo):
//   - Paginacao: assumido que o relatorio exportado ja traz todas as linhas
//     de uma vez (nao paginado). Se "Processos que atuo" crescer muito,
//     verifique se falta paginar.
//   - Resposta assincrona (`async: true`): implementado um retry simples;
//     o export de teste veio com `async: false` direto, entao o contrato
//     real de um pedido assincrono nunca foi observado - ajustar
//     `aguardarRelatorio` se necessario.
//   - Fluxo de login: a logica de deteccao de sucesso/falha (checar se a
//     URL ainda contem "/login") nao foi testada com usuario/senha reais.
// =========================================================================

import "dotenv/config";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { normalizarPlaca, limparNomeLoja, mascararPlaca } from "./lib/normalizar.mjs";
import WebSocket from "ws";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// "Processos que atuo" - confirmado observando a chamada real da tela ao
// clicar em Exportar (ver memoria do projeto). Se o ViaNuvem mudar os ids
// dos filtros, isso precisa ser reconferido do mesmo jeito (interceptando
// window.fetch no console do navegador logado).
const QUICK_FILTER_ID_PROCESSOS_QUE_ATUO = 2;

const URL_LOGIN = "https://app.vianuvem.com.br/auto/login";
const URL_EXPORT = "https://workspace.vianuvem.com.br/bff/api/v1/search/report/workflows";

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

const PASTA_DEBUG = "/app/debug";

// Quando o login falha, tira um print e pega o texto visivel da tela (nunca
// a senha, que so existe no campo de input, nao no texto renderizado) para
// dar pra diagnosticar de longe sem precisar adivinhar. Salva em
// PASTA_DEBUG, que o docker-compose monta como volume pra sobreviver ao
// --rm do container.
async function capturarDiagnosticoDeFalha(page) {
  try {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(PASTA_DEBUG, { recursive: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
    const caminhoPrint = `${PASTA_DEBUG}/login-falhou-${carimbo}.png`;
    await page.screenshot({ path: caminhoPrint, fullPage: true });

    const textoTela = await page.evaluate(() => document.body.innerText).catch(() => "");
    const textoResumido = textoTela.replace(/\s+/g, " ").trim().slice(0, 400);

    return `Print salvo em ${caminhoPrint}. Texto visivel na tela: "${textoResumido}"`;
  } catch (err) {
    return `(nao foi possivel capturar diagnostico: ${err})`;
  }
}

async function login(usuario, senha) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();

  try {
    // "networkidle" nunca e alcancado nesse site - ele carrega pixels de
    // rastreamento (Facebook, LinkedIn Ads, LaunchDarkly) que continuam
    // fazendo requisicoes em segundo plano indefinidamente, entao a rede
    // nunca "para" de verdade. "domcontentloaded"/"load" bastam pro
    // formulario de login estar pronto - confirmado com erro real de
    // timeout em producao (ver memoria do projeto).
    await page.goto(URL_LOGIN, { waitUntil: "domcontentloaded" });
    await page.fill("#username", usuario);
    await page.fill("#password", senha);
    await Promise.all([
      page.waitForLoadState("load").catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      const diagnostico = await capturarDiagnosticoDeFalha(page);
      throw new Error(
        "Login nao concluido (ainda na tela de login - possivel senha errada, " +
          "verificacao adicional, ou o reCAPTCHA pontuou a sessao como suspeita). " +
          diagnostico
      );
    }

    const cookies = await context.cookies();
    return cookies;
  } finally {
    await browser.close();
  }
}

function cookieHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function pedirRelatorio(cookie) {
  const resposta = await fetch(URL_EXPORT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
    body: JSON.stringify({
      searchMoment: Date.now(),
      page: 1,
      searchType: "workflows",
      quickFilterId: QUICK_FILTER_ID_PROCESSOS_QUE_ATUO,
    }),
  });

  if (!resposta.ok) {
    throw new Error(`Falha ao pedir relatorio: HTTP ${resposta.status}`);
  }
  return resposta.json();
}

// Espera o relatorio ficar pronto se a API responder de forma assincrona.
// Contrato exato nao confirmado - ajustar se necessario (ver LIMITACOES).
async function aguardarRelatorio(cookie, primeiraResposta) {
  let atual = primeiraResposta;
  let tentativas = 0;
  while (atual.async && !atual.fullSignedURL && tentativas < 10) {
    await new Promise((r) => setTimeout(r, 3000));
    atual = await pedirRelatorio(cookie);
    tentativas += 1;
  }
  if (!atual.fullSignedURL) {
    throw new Error(
      "Relatorio nao ficou pronto a tempo (resposta async sem fullSignedURL)."
    );
  }
  return atual.fullSignedURL;
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

export function mapearLinha(linhaArray, colEstabelecimento) {
  const campos = extrairCamposDinamicos(linhaArray);
  const col = (campo) => acharCampoDinamico(campos, CAMPOS_DINAMICOS[campo]);
  return {
    numeroProposta: col("numeroProposta"),
    nomeCliente: col("nomeCliente"),
    cpf: col("cpf"),
    email: col("email"),
    telefone: col("celular"),
    placa: normalizarPlaca(col("placa") || ""),
    loja: colEstabelecimento === -1 ? null : limparNomeLoja(linhaArray[colEstabelecimento]),
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

  console.log("[vianuvem-import] Autenticando...");
  const cookies = await login(VIANUVEM_USUARIO, VIANUVEM_SENHA);
  const cookie = cookieHeader(cookies);

  console.log("[vianuvem-import] Pedindo relatorio de processos...");
  const primeiraResposta = await pedirRelatorio(cookie);
  const signedUrl = await aguardarRelatorio(cookie, primeiraResposta);

  console.log("[vianuvem-import] Baixando e lendo planilha...");
  const { headers, linhas } = await baixarLinhas(signedUrl);
  if (linhas.length === 0) {
    console.log("[vianuvem-import] Nenhum processo encontrado.");
    return;
  }
  const colEstabelecimento = acharColunaFixa(headers, COLUNAS_FIXAS.estabelecimento);

  let importados = 0;
  let ignorados = 0;

  for (const linhaBruta of linhas) {
    const lead = mapearLinha(linhaBruta, colEstabelecimento);

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
      vendedor_nome: "ViaNuvem (importacao automatica)",
      loja: lead.loja,
      nome_cliente: lead.nomeCliente,
      telefone: lead.telefone,
      placa: lead.placa,
      cpf: lead.cpf,
      email: lead.email,
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
